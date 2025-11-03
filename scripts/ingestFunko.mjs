import "dotenv/config";
import { Pool } from "pg";

// Source JSON (can override via env)
const DATA_URL =
  process.env.FUNKO_JSON_URL ||
  "https://raw.githubusercontent.com/kennymkchan/funko-pop-data/master/funko_pop.json";

const BATCH_SIZE = 1000;

/* ---------------- helpers you already have ---------------- */

function slugifyHandle(h) {
  if (!h) return null;
  return String(h)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

/** Prefer row that has image and more fields filled. */
function pickBetter(a, b) {
  const score = (r) =>
    (r.image ? 2 : 0) +
    (Array.isArray(r.series) ? Math.min(r.series.length, 3) : 0) +
    (r.title ? 1 : 0);
  return score(b) > score(a) ? b : a;
}

/** De-duplicate by keyFn (handle) while preferring "better" rows. */
function dedupeBy(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!k) continue;
    if (!map.has(k)) map.set(k, r);
    else map.set(k, pickBetter(map.get(k), r));
  }
  return [...map.values()];
}

function toStr(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function toArr(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String);
  return [String(v)];
}

/* ---------------- NEW: normalizer (step 2-A) ---------------- */

/**
 * Normalize one Funko item into our table shape.
 * Always includes `raw` for NOT NULL and audit/debug.
 */
function normalizeFunko(item) {
  // Title / handle
  const title =
    toStr(item.title) ||
    toStr(item.Name) ||
    toStr(item.name) ||
    "Unknown";
  const handle = slugifyHandle(title);

  // Image: try common keys from various datasets
  const image =
    toStr(item.image) ||
    toStr(item.img) ||
    toStr(item.imageURL) ||
    toStr(item.imageUrl) ||
    toStr(item.image_url) ||
    null;

  // Brand / number / franchise
  const brand = toStr(item.brand) || "Funko";
  const number =
    toStr(item.number) ||
    toStr(item.no) ||
    toStr(item["Pop Number"]) ||
    null;
  const franchise =
    toStr(item.franchise) ||
    toStr(item.brand_line) ||
    toStr(item.collection) ||
    null;

  // Category — default to “Funko Pop” if missing
  const category = toStr(item.category) || "Funko Pop";

  // Series: merge a few potential fields, keep unique strings
  const seriesMerged = [
    ...toArr(item.series),
    ...toArr(item.collection),
    ...toArr(item.line),
    ...toArr(item.lines),
  ].filter(Boolean);
  const series = [...new Set(seriesMerged)];

  // Variants / exclusives / colorways: keep whatever shape as JSONB
  const variants =
    item.variants ??
    item.variant ??
    item.exclusive ??
    item.exclusives ??
    null;

  return {
    handle,
    title,
    image,
    series,      // text[]
    brand,
    number,
    franchise,
    category,
    variants,    // jsonb (nullable)
    raw: item,   // jsonb (NOT NULL)
  };
}

/* ---------------- DB upsert (includes `raw`) ---------------- */

async function upsertBatch(client, rows) {
  if (rows.length === 0) return;

  // Columns we insert/update
  const cols = [
    "handle",
    "title",
    "image",
    "series",
    "brand",
    "number",
    "franchise",
    "category",
    "variants",
    "raw",
  ];

  const placeholders = [];
  const params = [];
  let i = 1;

  for (const r of rows) {
    placeholders.push(
      `($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++})`
    );
    params.push(
      r.handle,
      r.title,
      r.image,
      r.series,                                    // pg maps JS array -> text[]
      r.brand,
      r.number,
      r.franchise,
      r.category,
      r.variants ? JSON.stringify(r.variants) : null, // jsonb
      JSON.stringify(r.raw)                           // jsonb (NOT NULL)
    );
  }

  const sql = `
    INSERT INTO funko_pops (${cols.join(", ")})
    VALUES ${placeholders.join(", ")}
    ON CONFLICT (handle) DO UPDATE SET
      title      = EXCLUDED.title,
      image      = COALESCE(EXCLUDED.image, funko_pops.image),
      series     = EXCLUDED.series,
      brand      = COALESCE(EXCLUDED.brand, funko_pops.brand),
      number     = COALESCE(EXCLUDED.number, funko_pops.number),
      franchise  = COALESCE(EXCLUDED.franchise, funko_pops.franchise),
      category   = COALESCE(EXCLUDED.category, funko_pops.category),
      variants   = COALESCE(EXCLUDED.variants, funko_pops.variants),
      raw        = EXCLUDED.raw,
      updated_at = now()
  `;

  await client.query(sql, params);
}

/* ---------------- main ---------------- */

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // If your DATABASE_URL already has sslmode=require (Neon), no need to set ssl here.
  });

  const client = await pool.connect();
  try {
    console.log("→ Loading Funko dataset from:", DATA_URL);
    const res = await fetch(DATA_URL);
    if (!res.ok) {
      throw new Error(`Failed to download dataset: HTTP ${res.status}`);
    }
    const data = await res.json();
    const rawItems = Array.isArray(data) ? data : data?.data || data?.items || [];

    const normalized = rawItems.map(normalizeFunko).filter((r) => r.handle);
    const deduped = dedupeBy(normalized, (r) => r.handle);

    console.log(`→ Prepared ${deduped.length} records`);

    await client.query("BEGIN");

    for (let start = 0; start < deduped.length; start += BATCH_SIZE) {
      const slice = deduped.slice(start, start + BATCH_SIZE);
      await upsertBatch(client, slice);
      console.log(
        `   upserted ${Math.min(start + BATCH_SIZE, deduped.length)}/${deduped.length}`
      );
    }

    await client.query("COMMIT");
    console.log("✓ Ingest complete");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("✗ Ingest failed:", err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
