#!/usr/bin/env node
/**
 * Sports Cards Harvester
 * Sources:
 *   - Wikimedia Commons (PD / CC-BY/SA)
 *   - Library of Congress (PD)
 *   - The Met Open Access (PD)
 *
 * Dedupe:
 *   - Canonical key: sport|year|set|cardNo|player
 *   - Exact image hash (sha256) + perceptual hash via Jimp (pHash)
 *
 * ENV:
 *   DATABASE_URL=postgres://user:pass@host/db
 *   CF_IMAGES_ACCOUNT=... (optional)
 *   CF_IMAGES_TOKEN=...   (optional)
 *   COMMONS_DELAY_MS=300  (optional politeness)
 *   LOC_DELAY_MS=300      (optional politeness)
 *   MET_DELAY_MS=250      (optional politeness)
 *   VERBOSE_LOGS=0|1
 */

import crypto from "node:crypto";
import pg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

import { Jimp } from "jimp";

const { Client } = pg;

// ------------ small utils & knobs ------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const COMMONS_DELAY_MS = parseInt(process.env.COMMONS_DELAY_MS || "300", 10);
const LOC_DELAY_MS = parseInt(process.env.LOC_DELAY_MS || "300", 10);
const MET_DELAY_MS = parseInt(process.env.MET_DELAY_MS || "250", 10);
const VERBOSE_LOGS = process.env.VERBOSE_LOGS === "1";

function logMaybe(...args) { if (VERBOSE_LOGS) console.warn(...args); }

function computeDelay(attempt, base = 300, max = 8000) {
  const exp = Math.min(max, base * 2 ** attempt);
  return Math.floor(exp / 2 + Math.random() * (exp / 2)); // jitter
}

function slug(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}
function hamming(a, b) {
  const ba = Buffer.from(a || "", "hex");
  const bb = Buffer.from(b || "", "hex");
  if (!ba.length || !bb.length) return 64;
  let d = 0;
  for (let i = 0; i < Math.min(ba.length, bb.length); i++) {
    let x = ba[i] ^ bb[i];
    while (x) { d += x & 1; x >>= 1; }
  }
  return d + Math.abs(ba.length - bb.length) * 8;
}
function canonKey({ sport, year, setName, number, player }) {
  return [sport, year || "", (setName || "").trim(), (number || "").trim(), (player || "").trim()]
    .map((s) => (s + "").toLowerCase().replace(/\s+/g, " ").trim())
    .join("|");
}
function idFromKey(k) { return crypto.createHash("md5").update(k).digest("hex"); }

// ------------ quiet counters for Met noise ------------
const stats = { met404: 0, met403: 0, metObjOtherErr: 0 };

// ------------ robust fetch helpers (Node 22 global fetch) ------------
async function fetchWithRetry(url, opts = {}, cfg = {}) {
  const {
    retries = 6,
    baseDelay = 400,
    maxDelay = 9000,
    timeoutMs = 15000,
    retryOn = (res, err) => {
      if (err) return true;                         // network: ECONNRESET/ETIMEDOUT
      if (!res) return true;
      if (res.status === 408 || res.status === 429) return true;
      if (res.status >= 500) return true;           // server errors
      return false;
    },
  } = cfg;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    let res, err;
    try {
      // friendly UA; some APIs/WAFs behave better
      const baseHeaders = {
        "user-agent": "LegendaryCollectiblesHarvester/1.0 (+https://legendary-collectibles.com)"
      };
      res = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), ...baseHeaders }, signal: ac.signal });
    } catch (e) {
      err = e;
    } finally {
      clearTimeout(timer);
    }

    if (res && res.ok) return res;

    const should = retryOn(res, err) && attempt < retries;
    if (!should) {
      if (err) throw err;
      const text = res ? await res.text().catch(() => "") : "";
      throw new Error(`HTTP ${res?.status || "ERR"} ${res?.statusText || ""} ${text.slice(0, 160)}`.trim());
    }

    let delayMs = computeDelay(attempt, baseDelay, maxDelay);
    const retryAfter = res?.headers?.get?.("retry-after");
    const ra = retryAfter ? Number(retryAfter) : NaN;
    if (!Number.isNaN(ra)) delayMs = Math.max(delayMs, ra * 1000);
    await sleep(delayMs);
  }
  throw new Error("unreachable");
}

async function getJsonWithRetry(url, opts = {}, cfg) {
  const res = await fetchWithRetry(url, { ...opts, headers: { accept: "application/json", ...(opts.headers || {}) } }, cfg);
  return res.json();
}
async function getBufferWithRetry(url, opts = {}, cfg) {
  const res = await fetchWithRetry(url, { ...opts, redirect: "follow" }, cfg);
  const contentType = res.headers.get("content-type") || "";
  const ab = await res.arrayBuffer();
  return { buf: Buffer.from(ab), contentType };
}

// Prevent an iterator throw from killing the whole run
async function safeForEachGen(gen, handler) {
  const it = gen[Symbol.asyncIterator]();
  while (true) {
    let next;
    try {
      next = await it.next();
    } catch (e) {
      console.warn("generator step failed:", e?.message || e);
      continue;
    }
    if (next.done) break;
    try {
      await handler(next.value);
    } catch (e) {
      console.warn("handler failed:", e?.message || e);
    }
  }
}

// ------------ DB bootstrapping ------------
async function ensureTables(client) {
  await client.query(`
CREATE TABLE IF NOT EXISTS sc_sets(
  id text PRIMARY KEY,
  sport text NOT NULL,
  year int,
  name text NOT NULL,
  source text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS sc_cards(
  id text PRIMARY KEY,
  sport text NOT NULL,
  year int,
  set_name text,
  number text,
  player text,
  team text,
  canonical_key text NOT NULL,
  source text NOT NULL,
  source_url text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS sc_cards_canonical_idx ON sc_cards(canonical_key);

CREATE TABLE IF NOT EXISTS sc_images(
  id serial PRIMARY KEY,
  card_id text NOT NULL REFERENCES sc_cards(id) ON DELETE CASCADE,
  src_url text NOT NULL,
  license text,
  credit text,
  width int,
  height int,
  sha256 text NOT NULL,
  phash text NOT NULL,
  is_primary boolean DEFAULT true NOT NULL,
  cf_image_id text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
-- exact dupes protection (must be UNIQUE for UPSERT)
CREATE UNIQUE INDEX IF NOT EXISTS sc_images_sha256_uniq ON sc_images(sha256);
CREATE INDEX IF NOT EXISTS sc_images_phash_idx ON sc_images(phash);
  `);
}

async function upsertSet(client, { sport, year, name, source }) {
  const id = slug([sport, year, name].filter(Boolean).join("-"));
  await client.query(
    `INSERT INTO sc_sets (id, sport, year, name, source)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (id) DO UPDATE SET sport=EXCLUDED.sport, year=EXCLUDED.year, name=EXCLUDED.name, source=EXCLUDED.source, updated_at=now()`,
    [id, sport, year || null, name, source]
  );
  return id;
}

async function upsertCard(client, card) {
  const k = canonKey(card);
  const id = idFromKey(k);
  await client.query(
    `INSERT INTO sc_cards (id, sport, year, set_name, number, player, team, canonical_key, source, source_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (id) DO UPDATE SET
       sport=EXCLUDED.sport, year=EXCLUDED.year, set_name=EXCLUDED.set_name, number=EXCLUDED.number,
       player=EXCLUDED.player, team=EXCLUDED.team, canonical_key=EXCLUDED.canonical_key,
       source=EXCLUDED.source, source_url=EXCLUDED.source_url, updated_at=now()`,
    [id, card.sport, card.year || null, card.setName || null, card.number || null, card.player || null, card.team || null, k, card.source, card.sourceUrl || null]
  );
  return id;
}

async function imageExists(client, sha, ph) {
  const { rows } = await client.query(
    `SELECT id, phash FROM sc_images WHERE sha256 = $1 OR phash = $2 LIMIT 10`,
    [sha, ph]
  );
  if (!rows.length) return { exists: false };
  for (const r of rows) {
    if (hamming(r.phash, ph) <= 8) return { exists: true, id: r.id };
  }
  return { exists: false };
}

async function saveImage(client, cardId, meta, buf, contentType) {
  const ct = (contentType || "").toLowerCase();
  if (!ct.startsWith("image/")) return null;
  if (ct.includes("svg")) return null;

  const sha = sha256(buf);

  let width = null, height = null, ph = null;
  try {
    const img = await Jimp.read(buf);
    width = img.bitmap?.width ?? null;
    height = img.bitmap?.height ?? null;
    ph = img.hash(); // pHash (string)
  } catch {
    return null;
  }

  // fast skip if obviously present (helps avoid CF upload for dupes)
  const pre = await imageExists(client, sha, ph);
  if (pre.exists) return null;

  // Optional: upload to Cloudflare Images (pull by URL)
  let cfImageId = null;
  if (process.env.CF_IMAGES_ACCOUNT && process.env.CF_IMAGES_TOKEN) {
    try {
      const up = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_IMAGES_ACCOUNT}/images/v1`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.CF_IMAGES_TOKEN}` },
          body: (() => { const f = new FormData(); f.set("url", meta.srcUrl); return f; })(),
        }
      );
      const j = await up.json();
      if (j?.success) cfImageId = j.result?.id || null;
    } catch { /* ignore CF upload issues */ }
  }

  // UPSERT on sha256 (requires unique index on sha256)
  const { rows } = await client.query(
    `INSERT INTO sc_images
       (card_id, src_url, license, credit, width, height, sha256, phash, is_primary, cf_image_id)
     VALUES
       ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (sha256) DO NOTHING
     RETURNING id`,
    [cardId, meta.srcUrl, meta.license || null, meta.credit || null, width, height, sha, ph, true, cfImageId]
  );

  if (rows.length) return rows[0].id;

  // if conflict, fetch existing id
  const { rows: existing } = await client.query(`SELECT id FROM sc_images WHERE sha256 = $1 LIMIT 1`, [sha]);
  return existing[0]?.id ?? null;
}

// ------------ Wikimedia Commons ------------
async function* commonsGenerator() {
  const cats = [
    "Category:Baseball_cards",
    "Category:Topps_baseball_cards",
    "Category:Topps_American_football_cards",
    "Category:Basketball_cards",
    "Category:American_football_trading_cards",
    "Category:Football_cards_(American_football)",
    "Category:1987–88_Duke_Blue_Devils_men's_basketball_team_cards",
  ];
  for (const c of cats) {
    let cmcontinue;
    do {
      const url = new URL("https://commons.wikimedia.org/w/api.php");
      url.searchParams.set("action", "query");
      url.searchParams.set("list", "categorymembers");
      url.searchParams.set("cmtitle", c);
      url.searchParams.set("cmtype", "file");
      url.searchParams.set("format", "json");
      url.searchParams.set("cmlimit", "500");
      if (cmcontinue) url.searchParams.set("cmcontinue", cmcontinue);

      let json;
      try {
        json = await getJsonWithRetry(url.toString(), {}, { retries: 5, baseDelay: 400, maxDelay: 6000, timeoutMs: 12000 });
      } catch (e) {
        console.warn("commons category list failed:", c, e.message);
        break;
      }
      const ids = (json.query?.categorymembers || []).map((m) => m.pageid);
      if (ids.length) {
        const url2 = new URL("https://commons.wikimedia.org/w/api.php");
        url2.searchParams.set("action", "query");
        url2.searchParams.set("pageids", ids.join("|"));
        url2.searchParams.set("prop", "imageinfo");
        url2.searchParams.set("iiprop", "url|mime|size|extmetadata|canonicaltitle");
        url2.searchParams.set("format", "json");
        let j2;
        try {
          j2 = await getJsonWithRetry(url2.toString(), {}, { retries: 5, baseDelay: 400, maxDelay: 6000, timeoutMs: 12000 });
        } catch (e) {
          console.warn("commons imageinfo failed:", e.message);
          j2 = null;
        }
        for (const pageId of Object.keys(j2?.query?.pages || {})) {
          const p = j2.query.pages[pageId];
          const ii = (p.imageinfo || [])[0];
          if (!ii?.url) continue;
          const meta = ii.extmetadata || {};
          const license = (meta.LicenseShortName?.value || "").toUpperCase();
          if (!/PD|PUBLIC DOMAIN|CC[- ]?BY/i.test(license) && !/CC[- ]?BY[- ]?SA/i.test(license)) continue;

          const title = (p.title || "").replace(/^File:/, "");
          const parsed = parseCardFromTitle(title);

          yield {
            source: "commons",
            sourceUrl: ii.descriptionurl || null,
            sport: parsed.sport,
            year: parsed.year,
            setName: parsed.setName,
            number: parsed.number,
            player: parsed.player,
            image: {
              srcUrl: ii.url,
              license: license || null,
              credit: meta.Credit?.value || meta.Artist?.value || "Wikimedia Commons",
            },
          };
        }
      }
      cmcontinue = json.continue?.cmcontinue;
      await sleep(COMMONS_DELAY_MS);
    } while (cmcontinue);
  }
}

function parseCardFromTitle(s) {
  const out = { sport: guessSport(s), year: null, setName: null, number: null, player: null };
  const mYear = s.match(/\b(19|20)\d{2}\b/);
  if (mYear) out.year = parseInt(mYear[0], 10);
  const mNo = s.match(/#\s*([A-Za-z0-9\-\/]+)/) || s.match(/\bNo\.?\s*([A-Za-z0-9\-\/]+)/i);
  if (mNo) out.number = mNo[1];

  const sets = ["Bowman", "Topps", "Fleer", "Donruss", "Hoops", "Prizm", "Select", "Optic", "Upper Deck", "Panini"];
  const found = sets.find((k) => new RegExp(`\\b${k}\\b`, "i").test(s));
  if (found) out.setName = found;

  const n = s.replace(/\.[a-z]{3,4}$/i, "").replace(/_/g, " ");
  const parts = n.split(/[-–—]| by | from /i).map((x) => x.trim());
  const last = parts[parts.length - 1];
  if (/\b[A-Z][a-z]+\s+[A-Z][a-z]+/.test(last)) out.player = last;
  return out;
}
function guessSport(s) {
  if (/basketball|duke|nba/i.test(s)) return "basketball";
  if (/football|nfl/i.test(s)) return "football";
  return "baseball";
}

// ------------ Library of Congress ------------
async function* locGenerator() {
  let page = 1;
  while (page <= 50) {
    const url = `https://www.loc.gov/collections/baseball-cards/?fo=json&at=results&c=100&sp=${page}`;
    let j;
    try {
      j = await getJsonWithRetry(url, {}, { retries: 5, baseDelay: 400, maxDelay: 6000, timeoutMs: 12000 });
    } catch (e) {
      console.warn("loc page failed:", page, e.message);
      break;
    }
    const items = j?.results || [];
    for (const it of items) {
      const img = (it.image_url || [])[0];
      if (!img) continue;
      const title = it.title || "";
      const year = parseInt((it.date || "").match(/\d{4}/)?.[0] || "0", 10) || null;

      yield {
        source: "loc",
        sourceUrl: it.id || it.url || null,
        sport: "baseball",
        year,
        setName: "Benjamin K. Edwards (LoC)",
        number: null,
        player: title.replace(/\(.*\)/, "").trim(),
        image: {
          srcUrl: img,
          license: "Public Domain (LoC Free to Use)",
          credit: "Library of Congress",
        },
      };
    }
    if (!j?.pagination?.next) break;
    page++;
    await sleep(LOC_DELAY_MS);
  }
}

// ------------ The Met Open Access ------------
async function* metGenerator() {
  // Pull all objectIDs for 3 sports; no cap/slicing.
  const SPORT_QUERIES = [
    { sport: "baseball",   q: "baseball%20cards" },
    { sport: "basketball", q: "basketball%20cards" },
    { sport: "football",   q: "american%20football%20cards" },
  ];

  for (const sq of SPORT_QUERIES) {
    const searchUrl =
      `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&isPublicDomain=true&q=${sq.q}`;

    let sj;
    try {
      sj = await getJsonWithRetry(searchUrl, {}, { retries: 4, baseDelay: 600, maxDelay: 9000, timeoutMs: 15000 });
    } catch (e) {
      console.warn("met search failed:", sq.sport, e.message);
      continue;
    }

    const ids = sj.objectIDs || [];
    let consec403 = 0;

    for (const id of ids) {
      let o;
      try {
        o = await getJsonWithRetry(
          `https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`,
          {},
          { retries: 0, baseDelay: 600, maxDelay: 10000, timeoutMs: 12000 } // don't retry 4xx
        );
      } catch (e) {
        const msg = String(e?.message || "");
        if (msg.includes("HTTP 404")) {
          stats.met404++; logMaybe("met 404:", id);
          consec403 = 0;
        } else if (msg.includes("HTTP 403")) {
          stats.met403++; logMaybe("met 403:", id);
          consec403++;
          if (consec403 >= 5) { // cool-off on bursts of 403
            await sleep(15_000);
            consec403 = 0;
          }
        } else {
          stats.metObjOtherErr++; logMaybe("met other:", id, msg);
          consec403 = 0;
        }
        continue;
      }

      consec403 = 0;
      if (!o?.isPublicDomain) continue;
      const imgUrl = o.primaryImageSmall || o.primaryImage;
      if (!imgUrl) continue;

      const title = o.title || "";
      const year = parseInt((o.objectDate || "").match(/\d{4}/)?.[0] || "0", 10) || null;

      yield {
        source: "met",
        sourceUrl: o.objectURL || null,
        sport: sq.sport, // from the query
        year,
        setName: (o.department || "").includes("The American Wing") ? "Burdick Collection (The Met)" : "The Met",
        number: null,
        player: title.replace(/\(.*\)/, "").trim(),
        image: {
          srcUrl: imgUrl,
          license: "Public Domain (The Met Open Access)",
          credit: "The Metropolitan Museum of Art",
        },
      };

      await sleep(MET_DELAY_MS);
    }
  }
}

// ------------ Runner ------------
process.on("unhandledRejection", (e) => console.warn("unhandledRejection:", e?.message || e));
process.on("uncaughtException", (e) => console.warn("uncaughtException:", e?.message || e));

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await ensureTables(client);

  let addedCards = 0, addedImages = 0;
  const seenKeys = new Set();

  await safeForEachGen(commonsGenerator(), async (src) => {
    if (!src?.image?.srcUrl) return;
    const key = canonKey(src);
    if (seenKeys.has(key)) return;
    seenKeys.add(key);

    await upsertSet(client, { sport: src.sport, year: src.year, name: src.setName || "Unknown Set", source: src.source });
    const cardId = await upsertCard(client, { ...src, setName: src.setName || "Unknown Set" });
    addedCards++;

    let file;
    try {
      file = await getBufferWithRetry(src.image.srcUrl, {}, { retries: 4, baseDelay: 500, maxDelay: 6000, timeoutMs: 20000 });
    } catch (e) {
      console.warn("image fetch failed:", e.message, src.image.srcUrl);
      return;
    }
    const imgId = await saveImage(client, cardId, src.image, file.buf, file.contentType);
    if (imgId) addedImages++;
  });

  await safeForEachGen(locGenerator(), async (src) => {
    const key = canonKey(src);
    if (seenKeys.has(key)) return;
    seenKeys.add(key);

    await upsertSet(client, { sport: src.sport, year: src.year, name: src.setName, source: src.source });
    const cardId = await upsertCard(client, src);
    addedCards++;

    let file;
    try {
      file = await getBufferWithRetry(src.image.srcUrl, {}, { retries: 4, baseDelay: 500, maxDelay: 6000, timeoutMs: 20000 });
    } catch (e) {
      console.warn("image fetch failed:", e.message, src.image.srcUrl);
      return;
    }
    const imgId = await saveImage(client, cardId, src.image, file.buf, file.contentType);
    if (imgId) addedImages++;
  });

  await safeForEachGen(metGenerator(), async (src) => {
    const key = canonKey(src);
    if (seenKeys.has(key)) return;
    seenKeys.add(key);

    await upsertSet(client, { sport: src.sport, year: src.year, name: src.setName, source: src.source });
    const cardId = await upsertCard(client, src);
    addedCards++;

    let file;
    try {
      file = await getBufferWithRetry(src.image.srcUrl, {}, { retries: 4, baseDelay: 500, maxDelay: 6000, timeoutMs: 20000 });
    } catch (e) {
      console.warn("image fetch failed:", e.message, src.image.srcUrl);
      return;
    }
    const imgId = await saveImage(client, cardId, src.image, file.buf, file.contentType);
    if (imgId) addedImages++;
  });

  console.log(`Done.
New cards: ${addedCards}
New images: ${addedImages}
The Met skips — 404: ${stats.met404}, 403: ${stats.met403}, other: ${stats.metObjOtherErr}`);

  await client.end();
}

run().catch((e) => {
  console.error("Fatal:", e?.stack || e);
  process.exit(1);
});
