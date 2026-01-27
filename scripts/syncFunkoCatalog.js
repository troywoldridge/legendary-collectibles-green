#!/usr/bin/env node
/**
 * scripts/syncFunkoCatalog.js
 *
 * Phase 1: Import Funko catalog into public.funko_items.
 * IMPORTANT: This version does NOT overwrite existing rows.
 * It will INSERT new rows and DO NOTHING on conflicts.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";

const { Pool } = pg;

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

function normStr(v) {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function normBool(v, fallback = false) {
  if (v === null || v === undefined) return fallback;
  const s = String(v).trim().toLowerCase();
  if (!s) return fallback;
  if (["1", "true", "yes", "y", "t"].includes(s)) return true;
  if (["0", "false", "no", "n", "f"].includes(s)) return false;
  return fallback;
}

function normInt(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  return i > 0 ? i : null;
}

function sha1(s) {
  return crypto.createHash("sha1").update(String(s), "utf8").digest("hex");
}

function pick(obj, ...keys) {
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k)) {
      const v = obj[k];
      if (v !== undefined) return v;
    }
    const kk = String(k).toLowerCase();
    for (const ok of Object.keys(obj || {})) {
      if (String(ok).toLowerCase() === kk) return obj[ok];
    }
  }
  return undefined;
}

function makeIdText(source, sourceId) {
  return `${source}:${sourceId}`;
}

/**
 * Map dataset row into your schema.
 * This is tolerant because datasets vary.
 * We'll refine mapping once you confirm which JSON file you're using.
 */
function mapToFunkoItem(input, source) {
  const name = normStr(pick(input, "name", "title", "pop_name", "product")) || "Unknown";
  const franchise = normStr(pick(input, "franchise", "license", "brand", "universe"));
  const series = normStr(pick(input, "series", "category", "collection"));
  const line = normStr(pick(input, "line", "type", "product_line")) || "Pop!";
  const number = normStr(pick(input, "number", "no", "pop_number", "funko_number"));
  const edition = normStr(pick(input, "edition", "wave"));
  const variant = normStr(pick(input, "variant", "finish", "subtype"));
  const exclusivity = normStr(pick(input, "exclusivity", "exclusive_to", "sticker"));
  const release_year = normInt(pick(input, "release_year", "year"));

  const is_chase = normBool(pick(input, "is_chase", "chase"), false);
  const is_exclusive = normBool(pick(input, "is_exclusive", "exclusive"), false);

  const upc = normStr(pick(input, "upc", "barcode", "ean", "gtin"));

  const description = normStr(pick(input, "description", "desc"));
  const image_small = normStr(pick(input, "image_small", "thumbnail", "thumb", "image"));
  const image_large = normStr(pick(input, "image_large", "image_url", "photo", "image_hd"));

  const explicitSourceId = normStr(pick(input, "source_id", "id", "guid", "handle", "slug"));
  const source_id =
    explicitSourceId ||
    (upc ? `upc:${upc}` : sha1([name, franchise ?? "", series ?? "", line ?? "", number ?? "", variant ?? ""].join("|")));

  const id = makeIdText(source, source_id);

  const extra = {
    raw: input,
  };

  const search_text = [
    name,
    franchise,
    series,
    line,
    number,
    edition,
    variant,
    exclusivity,
    upc,
    release_year ? String(release_year) : null,
    is_chase ? "chase" : null,
    is_exclusive ? "exclusive" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    id,
    name,
    franchise,
    series,
    line,
    number,
    edition,
    variant,
    is_chase,
    is_exclusive,
    exclusivity,
    release_year,
    upc,
    description,
    image_small,
    image_large,
    source,
    source_id,
    extra,
    search_text,
  };
}

async function insertBatchNoOverwrite(client, items) {
  if (!items.length) return 0;

  const cols = [
    "id",
    "name",
    "franchise",
    "series",
    "line",
    "number",
    "edition",
    "variant",
    "is_chase",
    "is_exclusive",
    "exclusivity",
    "release_year",
    "upc",
    "description",
    "image_small",
    "image_large",
    "source",
    "source_id",
    "extra",
    "search_text",
    "created_at",
    "updated_at",
  ];

  const values = [];
  const params = [];
  let p = 1;

  for (const it of items) {
    values.push(
      `(${cols
        .map((c) => {
          if (c === "created_at") return "now()";
          if (c === "updated_at") return "now()";
          return `$${p++}`;
        })
        .join(", ")})`,
    );

    params.push(
      it.id,
      it.name,
      it.franchise,
      it.series,
      it.line,
      it.number,
      it.edition,
      it.variant,
      it.is_chase,
      it.is_exclusive,
      it.exclusivity,
      it.release_year,
      it.upc,
      it.description,
      it.image_small,
      it.image_large,
      it.source,
      it.source_id,
      JSON.stringify(it.extra ?? {}),
      it.search_text,
    );
  }

  const sql = `
    INSERT INTO funko_items (${cols.join(", ")})
    VALUES ${values.join(", ")}
    ON CONFLICT (id) DO NOTHING
  `;

  const res = await client.query(sql, params);
  // pg returns rowCount for inserted rows
  return res.rowCount || 0;
}

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error("Missing DATABASE_URL.");
    process.exit(1);
  }

  const file = arg("--file");
  const source = normStr(arg("--source", "funko-pop-data")) || "funko-pop-data";

  if (!file) {
    console.error("Usage: node scripts/syncFunkoCatalog.js --file <path-to-json> [--source name]");
    process.exit(1);
  }

  const abs = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  if (!fs.existsSync(abs)) {
    console.error("File not found:", abs);
    process.exit(1);
  }

  console.log("[funko] importing:", abs, "source:", source);

  const raw = fs.readFileSync(abs, "utf8");
  const parsed = JSON.parse(raw);
  const inputRows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.data) ? parsed.data : null;

  if (!inputRows) {
    console.error("JSON must be an array or { data: [...] }");
    process.exit(1);
  }

  console.log("[funko] raw rows:", inputRows.length);

  const items = [];
  for (const r of inputRows) {
    items.push(mapToFunkoItem(r, source));
  }

  const pool = new Pool({ connectionString: DATABASE_URL, max: 5 });
  const client = await pool.connect();

  let inserted = 0;

  try {
    const BATCH = Number(arg("--batch", "500")) || 500;

    await client.query("BEGIN");
    for (let i = 0; i < items.length; i += BATCH) {
      const chunk = items.slice(i, i + BATCH);
      const ins = await insertBatchNoOverwrite(client, chunk);
      inserted += ins;

      if ((i / BATCH) % 10 === 0) {
        console.log(`[funko] processed ${Math.min(i + BATCH, items.length)}/${items.length}`);
      }
    }
    await client.query("COMMIT");
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    console.error("[funko] failed:", e?.message || e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }

  console.log("[funko] done. inserted:", inserted, "skipped(existing):", items.length - inserted);
}

main();
