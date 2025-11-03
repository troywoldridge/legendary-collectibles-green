import fs from "node:fs/promises";
import path from "node:path";
import "dotenv/config";
import { Pool } from "pg";
import { parse } from "node-html-parser";

/* ================== Config ================== */
const DATABASE_URL = process.env.DATABASE_URL || process.env.NEON_URL;
if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL (set to your Neon connection string).");
  process.exit(1);
}

const CF_ACCOUNT_ID   = process.env.CF_ACCOUNT_ID || process.env.NEXT_PUBLIC_CF_ACCOUNT_ID;
const CF_IMAGES_TOKEN = process.env.CF_IMAGES_TOKEN; // optional (to mirror images)

const INPUT_FILE = process.env.FUNKO_URLS_JSON || "data/funko/sitemapProductUrls.json";
const CONCURRENCY = Number(process.env.FUNKO_CONCURRENCY || 3);
const MAX_RETRIES = Number(process.env.FUNKO_MAX_RETRIES || 3);
const USER_AGENT =
  process.env.SCRAPE_UA ||
  "Mozilla/5.0 (X11; Linux x86_64) LegendaryCollectiblesBot/1.0 (+https://legendary-collectibles.com)";

const pool = new Pool({ connectionString: DATABASE_URL });

/* ================== Helpers ================== */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function slugifyHandle(title, number) {
  const base = String(title || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
  const num  = (number ? String(number).trim() : "").replace(/[^0-9a-z]+/gi, "");
  return num ? `${base}-${num}` : base || null;
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function coerceArr(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function resolveAbs(url, base) {
  try {
    return new URL(url, base).toString();
  } catch {
    return null;
  }
}

async function fetchText(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, "accept": "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/* -------- CF Images import-by-URL (optional) -------- */
async function importToCFByUrl(imageUrl, meta = {}) {
  if (!CF_ACCOUNT_ID || !CF_IMAGES_TOKEN) return null;
  try {
    const fd = new FormData();
    fd.append("url", imageUrl);
    fd.append("requireSignedURLs", "false");
    fd.append("metadata", JSON.stringify(meta));

    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/images/v1`,
      { method: "POST", headers: { Authorization: `Bearer ${CF_IMAGES_TOKEN}` }, body: fd }
    );
    const json = await res.json();
    if (!json?.success) {
      // Common: duplicate uploads return error but include result.id sometimes; ignore
      return null;
    }
    return json?.result?.id || null;
  } catch {
    return null;
  }
}

/* ================== Parsers ================== */
function pickProductJsonLd(root) {
  // gather all <script type=application/ld+json> blocks and find a Product
  const blocks = root.querySelectorAll('script[type="application/ld+json"]') || [];
  for (const s of blocks) {
    try {
      const txt = s.text?.trim() || s.innerText?.trim() || "";
      if (!txt) continue;
      const data = JSON.parse(txt);
      const candidates = Array.isArray(data) ? data : [data];
      for (const obj of candidates) {
        if (!obj || typeof obj !== "object") continue;
        const t = (obj["@type"] || obj.type || "").toString().toLowerCase();
        if (t.includes("product")) return obj;
        if (Array.isArray(obj["@type"]) && obj["@type"].some((x) => String(x).toLowerCase().includes("product"))) return obj;
      }
    } catch {}
  }
  return null;
}

function extractMetaContent(root, selector) {
  const el = root.querySelector(selector);
  return el?.getAttribute("content") || null;
}

function extractAllImages(root, baseUrl) {
  const out = [];

  // JSON-LD images
  const p = pickProductJsonLd(root);
  if (p?.image) out.push(...coerceArr(p.image).map((u) => resolveAbs(u, baseUrl)));

  // OpenGraph/Twitter
  out.push(resolveAbs(extractMetaContent(root, 'meta[property="og:image"]'), baseUrl));
  out.push(resolveAbs(extractMetaContent(root, 'meta[name="twitter:image"]'), baseUrl));
  out.push(resolveAbs(extractMetaContent(root, 'meta[property="og:image:url"]'), baseUrl));

  // Page <img> tags — prefer product gallery-ish classes
  for (const img of root.querySelectorAll("img")) {
    const src = img.getAttribute("src") || img.getAttribute("data-src") || img.getAttribute("data-original");
    if (!src) continue;
    const abs = resolveAbs(src, baseUrl);
    if (!abs) continue;
    // heuristic: skip sprites, svgs, icons
    if (/\.(svg|gif)$/i.test(abs)) continue;
    if (abs.includes("sprite") || abs.includes("icon")) continue;
    out.push(abs);
  }

  return unique(out);
}

function extractProductFields(html, url) {
  const root = parse(html);
  const p = pickProductJsonLd(root) || {};

  const title   = p.name || extractMetaContent(root, 'meta[property="og:title"]') || root.querySelector("title")?.text?.trim() || null;
  const sku     = p.sku || p.productID || null;
  const number  = (p.mpns && coerceArr(p.mpns)[0]) || sku || null; // best effort
  const brand   = typeof p.brand === "object" ? (p.brand.name || p.brand["@id"] || p.brand["@type"]) : p.brand || "Funko";
  const series  = coerceArr(p.category || p.isRelatedTo || p.isPartOf || p.brand).map(String);
  const cats    = coerceArr(p.category).map(String);
  const relDate = p.releaseDate || p.datePublished || null;

  let price = null, currency = null;
  const offers = Array.isArray(p.offers) ? p.offers[0] : p.offers;
  if (offers && typeof offers === "object") {
    if (offers.price) price = Number(offers.price);
    if (offers.priceCurrency) currency = String(offers.priceCurrency).toUpperCase();
  }

  const images = extractAllImages(root, url);
  const primaryImage = images[0] || null;

  const handle = slugifyHandle(title, number) || slugifyHandle(title, "") || slugifyHandle(brand, number);

  return {
    handle,
    title: title || null,
    number: number || null,
    brand: brand ? String(brand) : "Funko",
    series: series.length ? unique(series) : null,
    category: cats.length ? unique(cats) : null,
    release_date: relDate || null,
    price: Number.isFinite(price) ? price : null,
    currency: currency || null,
    image_url: primaryImage,
    images,
  };
}

/* ================== DB Ops ================== */
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS funko_scrape_queue (
      url            text PRIMARY KEY,
      status         text,
      tries          int  NOT NULL DEFAULT 0,
      last_error     text,
      updated_at     timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS funko_pops (
      id             bigserial PRIMARY KEY,
      handle         text UNIQUE,
      title          text,
      number         text,
      brand          text,
      series         text[],
      category       text[],
      release_date   text,
      price          numeric,
      currency       text,
      source_url     text UNIQUE,
      image_url      text,
      image_cf_id    text,
      raw            jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at     timestamptz NOT NULL DEFAULT now(),
      updated_at     timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS funko_pop_images (
      id             bigserial PRIMARY KEY,
      handle         text REFERENCES funko_pops(handle) ON DELETE CASCADE,
      url            text,
      cf_image_id    text,
      pos            int,
      width          int,
      height         int,
      UNIQUE (handle, url)
    );
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    CREATE INDEX IF NOT EXISTS funko_pops_title_trgm  ON funko_pops USING gin (title gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS funko_queue_status_idx ON funko_scrape_queue(status, updated_at);
  `);
}

async function seedQueueFromFile(jsonPath) {
  const abs = path.resolve(jsonPath);
  const raw = JSON.parse(await fs.readFile(abs, "utf8"));
  const urls = Array.isArray(raw) ? raw : raw.urls || [];
  if (!urls.length) throw new Error("No URLs in input file.");

  console.log(`→ Seeding ${urls.length} URLs into funko_scrape_queue ...`);
  // upsert in chunks
  const chunk = 1000;
  for (let i = 0; i < urls.length; i += chunk) {
    const slice = urls.slice(i, i + chunk);
    const values = slice.map((u, k) => `($${k + 1}, 'todo')`).join(",");
    const params = slice;
    await pool.query(
      `INSERT INTO funko_scrape_queue (url, status)
       VALUES ${values}
       ON CONFLICT (url) DO NOTHING`,
      params
    );
    process.stdout.write(`  seeded ${Math.min(i + slice.length, urls.length)} / ${urls.length}\r`);
  }
  process.stdout.write("\n");
  console.log("✓ Seed complete");
}

async function claimNextUrl() {
  // Grab one 'todo' or retryable 'error'
  const { rows } = await pool.query(
    `UPDATE funko_scrape_queue
     SET status='working', tries=tries+1, updated_at=now()
     WHERE url = (
       SELECT url FROM funko_scrape_queue
       WHERE (status IS NULL OR status='todo' OR (status='error' AND tries < $1))
       ORDER BY updated_at NULLS FIRST
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING url`,
    [MAX_RETRIES]
  );
  return rows[0]?.url || null;
}

async function markDone(url) {
  await pool.query(
    `UPDATE funko_scrape_queue SET status='done', last_error=NULL, updated_at=now() WHERE url=$1`,
    [url]
  );
}

async function markError(url, err) {
  await pool.query(
    `UPDATE funko_scrape_queue SET status='error', last_error=$2, updated_at=now() WHERE url=$1`,
    [url, (err && err.message) ? err.message : String(err)]
  );
}

async function upsertProduct(url, parsed, rawJson) {
  const {
    handle, title, number, brand, series, category,
    release_date, price, currency, image_url
  } = parsed;

  // upsert into funko_pops on source_url or handle
  const { rows } = await pool.query(
    `INSERT INTO funko_pops
      (handle, title, number, brand, series, category, release_date, price, currency, source_url, image_url, raw, updated_at)
     VALUES
      ($1,     $2,    $3,     $4,    $5,     $6,       $7,           $8,    $9,       $10,        $11,      $12, now())
     ON CONFLICT (source_url) DO UPDATE SET
       handle=EXCLUDED.handle,
       title=COALESCE(EXCLUDED.title, funko_pops.title),
       number=COALESCE(EXCLUDED.number, funko_pops.number),
       brand=COALESCE(EXCLUDED.brand, funko_pops.brand),
       series=COALESCE(EXCLUDED.series, funko_pops.series),
       category=COALESCE(EXCLUDED.category, funko_pops.category),
       release_date=COALESCE(EXCLUDED.release_date, funko_pops.release_date),
       price=COALESCE(EXCLUDED.price, funko_pops.price),
       currency=COALESCE(EXCLUDED.currency, funko_pops.currency),
       image_url=COALESCE(EXCLUDED.image_url, funko_pops.image_url),
       raw = COALESCE(EXCLUDED.raw, funko_pops.raw),
       updated_at=now()
     RETURNING handle`,
    [
      handle, title, number, brand, series, category,
      release_date, price, currency, url, image_url, rawJson,
    ]
  );

  return rows[0]?.handle || handle;
}

async function upsertImages(handle, images) {
  if (!images?.length) return;

  // Optionally mirror to CF
  let cfIds = new Map();
  if (CF_ACCOUNT_ID && CF_IMAGES_TOKEN) {
    for (let i = 0; i < images.length; i++) {
      const cfid = await importToCFByUrl(images[i], { handle, pos: i });
      if (cfid) cfIds.set(images[i], cfid);
      await sleep(150); // be nice to CF
    }
  }

  // Insert unique URLs
  const values = images
    .map((u, i) => `($1, $${i + 2}, $${i + 2 + images.length}, ${i})`)
    .join(",");
  const params = [handle, ...images, ...images.map((u) => cfIds.get(u) || null)];

  await pool.query(
    `INSERT INTO funko_pop_images (handle, url, cf_image_id, pos)
     VALUES ${values}
     ON CONFLICT (handle, url) DO UPDATE SET
       cf_image_id = COALESCE(EXCLUDED.cf_image_id, funko_pop_images.cf_image_id),
       pos = LEAST(funko_pop_images.pos, EXCLUDED.pos)`,
    params
  );

  // Optionally set primary cf id on funko_pops if first image got mirrored
  const firstCF = cfIds.get(images[0]);
  if (firstCF) {
    await pool.query(
      `UPDATE funko_pops SET image_cf_id=$2, updated_at=now() WHERE handle=$1 AND (image_cf_id IS NULL OR image_cf_id='')`,
      [handle, firstCF]
    );
  }
}

/* ================== Worker ================== */
async function workerLoop(id) {
  while (true) {
    const url = await claimNextUrl();
    if (!url) {
      // nothing left right now
      await sleep(1000);
      continue;
    }

    try {
      const html = await fetchText(url);
      const parsed = extractProductFields(html, url);
      // if parse failed to find a title, consider retryable error
      if (!parsed?.title) throw new Error("No title parsed");

      const raw = {
        url,
        parsed_at: new Date().toISOString(),
        // Store a tiny subset for reference (don’t store full HTML)
        snapshot: {
          handle: parsed.handle,
          title: parsed.title,
          number: parsed.number,
          image_count: parsed.images.length,
        },
      };

      const handle = await upsertProduct(url, parsed, raw);
      await upsertImages(handle, parsed.images);

      await markDone(url);
      process.stdout.write(`[W${id}] ✓ ${handle}   \r`);
    } catch (e) {
      await markError(url, e);
      process.stdout.write(`[W${id}] ✗ ${url} :: ${e?.message || e}   \r`);
      await sleep(250);
    }
  }
}

/* ================== CLI ================== */
async function main() {
  await ensureTables();

  const cmd = process.argv[2];
  if (cmd === "seed") {
    await seedQueueFromFile(INPUT_FILE);
    process.exit(0);
  }

  if (cmd === "crawl") {
    console.log(`→ Starting ${CONCURRENCY} workers…`);
    const workers = [];
    for (let i = 0; i < CONCURRENCY; i++) {
      workers.push(workerLoop(i + 1));
      await sleep(150); // stagger
    }
    await Promise.all(workers); // runs forever; Ctrl+C to stop
  } else {
    console.log(`Usage:
  node -r dotenv/config scripts/funkoHarvest.mjs seed
  node -r dotenv/config scripts/funkoHarvest.mjs crawl

Env:
  DATABASE_URL=postgres://...   (Neon)
  FUNKO_URLS_JSON=data/funko/sitemapProductUrls.json
  FUNKO_CONCURRENCY=3
  FUNKO_MAX_RETRIES=3
  CF_ACCOUNT_ID=xxxxx           (optional)
  CF_IMAGES_TOKEN=xxxxx         (optional)
`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
