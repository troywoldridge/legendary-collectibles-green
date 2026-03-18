#!/usr/bin/env node

/**
 * Full Scryfall reference-data sync for existing PostgreSQL tables.
 *
 * Populates:
 *   - public.scryfall_cards_raw
 *   - public.scryfall_sets
 *   - public.scryfall_catalogs
 *   - public.scryfall_catalog_values
 *   - public.scryfall_rulings
 *   - public.scryfall_card_symbols
 *
 * Uses:
 *   - bulk-data/default_cards  -> cards
 *   - bulk-data/rulings       -> rulings
 *   - /sets                   -> sets
 *   - /symbology              -> card symbols
 *   - /catalog/*              -> catalogs + catalog values
 *
 * Env:
 *   DATABASE_URL=postgres://...
 *   SCRYFALL_USER_AGENT=LegendaryCollectibles/1.0
 *   REQUEST_DELAY_MS=75
 *   BATCH_SIZE=500
 *   MISSING_ONLY=0
 *
 * Optional flags:
 *   SKIP_CARDS=1
 *   SKIP_RULINGS=1
 *   SKIP_SETS=1
 *   SKIP_SYMBOLS=1
 *   SKIP_CATALOGS=1
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { pipeline } from "node:stream/promises";
import { createWriteStream, createReadStream } from "node:fs";
import streamJson from "stream-json";
import streamArrayPkg from "stream-json/streamers/StreamArray.js";
import pg from "pg";

const { parser } = streamJson;
const { streamArray } = streamArrayPkg;
const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ Missing DATABASE_URL");
  process.exit(1);
}

const SCRYFALL_USER_AGENT =
  process.env.SCRYFALL_USER_AGENT || "LegendaryCollectibles/1.0";
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 75);
const BATCH_SIZE = Number(process.env.BATCH_SIZE || 500);
const MISSING_ONLY = String(process.env.MISSING_ONLY || "0") === "1";

const SKIP_CARDS = String(process.env.SKIP_CARDS || "0") === "1";
const SKIP_RULINGS = String(process.env.SKIP_RULINGS || "0") === "1";
const SKIP_SETS = String(process.env.SKIP_SETS || "0") === "1";
const SKIP_SYMBOLS = String(process.env.SKIP_SYMBOLS || "0") === "1";
const SKIP_CATALOGS = String(process.env.SKIP_CATALOGS || "0") === "1";

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 6,
});

const CATALOG_ENDPOINTS = [
  "card-names",
  "artist-names",
  "word-bank",
  "creature-types",
  "planeswalker-types",
  "land-types",
  "artifact-types",
  "enchantment-types",
  "spell-types",
  "powers",
  "toughnesses",
  "loyalties",
  "watermarks",
  "keyword-abilities",
  "keyword-actions",
  "ability-words",
  "supertypes",
  "card-types",
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function textOrNull(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

function intOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function numOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : null;
}

function dateOrNull(value) {
  if (!value || typeof value !== "string") return null;
  return value;
}

function arrText(value) {
  return Array.isArray(value) ? value.map(String) : [];
}

function sha256(input) {
  return crypto.createHash("sha256").update(String(input)).digest("hex");
}

function buildRowPlaceholders(rowCount, valueColsLength, trailingSqlValues = []) {
  return Array.from({ length: rowCount }, (_, rowIndex) => {
    const base = rowIndex * valueColsLength;
    const valuePlaceholders = Array.from(
      { length: valueColsLength },
      (_, i) => `$${base + i + 1}`
    );
    return `(${[...valuePlaceholders, ...trailingSqlValues].join(", ")})`;
  }).join(",\n");
}

function dedupeRulingRows(rows) {
  const map = new Map();

  for (const row of rows) {
    const key = [
      row.oracle_id,
      row.source,
      row.published_at,
      row.comment_sha256,
    ].join("||");

    if (!map.has(key)) {
      map.set(key, row);
    }
  }

  return Array.from(map.values());
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": SCRYFALL_USER_AGENT,
      Accept: "application/json;q=0.9,*/*;q=0.8",
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${url}`);
  }

  return res.json();
}

async function downloadToFile(url, filepath) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": SCRYFALL_USER_AGENT,
      Accept: "application/json;q=0.9,*/*;q=0.8",
    },
  });

  if (!res.ok || !res.body) {
    throw new Error(`Failed download ${url} status=${res.status}`);
  }

  await pipeline(res.body, createWriteStream(filepath));
}

async function getBulkDownloadUri(type) {
  const bulk = await fetchJson("https://api.scryfall.com/bulk-data");
  await sleep(REQUEST_DELAY_MS);

  const item = Array.isArray(bulk?.data)
    ? bulk.data.find((x) => x?.type === type)
    : null;

  if (!item?.download_uri) {
    throw new Error(`Missing download_uri for bulk-data type=${type}`);
  }

  return item.download_uri;
}

async function upsertSets(client, sets) {
  if (!sets.length) return 0;

  const cols = [
    "id",
    "code",
    "mtgo_code",
    "arena_code",
    "tcgplayer_id",
    "name",
    "set_type",
    "released_at",
    "block_code",
    "block",
    "parent_set_code",
    "card_count",
    "printed_size",
    "digital",
    "foil_only",
    "nonfoil_only",
    "scryfall_uri",
    "uri",
    "icon_svg_uri",
    "search_uri",
    "payload",
  ];

  const values = [];
  for (const row of sets) {
    for (const col of cols) values.push(row[col]);
  }

  const placeholders = buildRowPlaceholders(sets.length, cols.length, [
    "NOW()",
    "NOW()",
    "NOW()",
  ]);

  const sqlMissingOnly = `
    INSERT INTO public.scryfall_sets (
      ${cols.join(", ")}, fetched_at, updated_at, created_at
    )
    VALUES
      ${placeholders}
    ON CONFLICT (id) DO NOTHING
  `;

  const sqlUpsert = `
    INSERT INTO public.scryfall_sets (
      ${cols.join(", ")}, fetched_at, updated_at, created_at
    )
    VALUES
      ${placeholders}
    ON CONFLICT (id) DO UPDATE SET
      code = EXCLUDED.code,
      mtgo_code = EXCLUDED.mtgo_code,
      arena_code = EXCLUDED.arena_code,
      tcgplayer_id = EXCLUDED.tcgplayer_id,
      name = EXCLUDED.name,
      set_type = EXCLUDED.set_type,
      released_at = EXCLUDED.released_at,
      block_code = EXCLUDED.block_code,
      block = EXCLUDED.block,
      parent_set_code = EXCLUDED.parent_set_code,
      card_count = EXCLUDED.card_count,
      printed_size = EXCLUDED.printed_size,
      digital = EXCLUDED.digital,
      foil_only = EXCLUDED.foil_only,
      nonfoil_only = EXCLUDED.nonfoil_only,
      scryfall_uri = EXCLUDED.scryfall_uri,
      uri = EXCLUDED.uri,
      icon_svg_uri = EXCLUDED.icon_svg_uri,
      search_uri = EXCLUDED.search_uri,
      payload = EXCLUDED.payload,
      fetched_at = NOW(),
      updated_at = NOW()
  `;

  await client.query(MISSING_ONLY ? sqlMissingOnly : sqlUpsert, values);
  return sets.length;
}

async function syncSets(client) {
  console.log("📚 Syncing sets...");
  const payload = await fetchJson("https://api.scryfall.com/sets");
  await sleep(REQUEST_DELAY_MS);

  if (!Array.isArray(payload?.data)) {
    throw new Error("Unexpected /sets payload");
  }

  const rows = payload.data.map((set) => ({
    id: set.id,
    code: String(set.code),
    mtgo_code: textOrNull(set.mtgo_code),
    arena_code: textOrNull(set.arena_code),
    tcgplayer_id: intOrNull(set.tcgplayer_id),
    name: String(set.name),
    set_type: String(set.set_type),
    released_at: dateOrNull(set.released_at),
    block_code: textOrNull(set.block_code),
    block: textOrNull(set.block),
    parent_set_code: textOrNull(set.parent_set_code),
    card_count: intOrNull(set.card_count) ?? 0,
    printed_size: intOrNull(set.printed_size),
    digital: Boolean(set.digital),
    foil_only: Boolean(set.foil_only),
    nonfoil_only: Boolean(set.nonfoil_only),
    scryfall_uri: String(set.scryfall_uri),
    uri: String(set.uri),
    icon_svg_uri: textOrNull(set.icon_svg_uri),
    search_uri: String(set.search_uri),
    payload: JSON.stringify(set),
  }));

  const written = await upsertSets(client, rows);
  console.log(`✅ sets: ${written}`);
}

async function upsertSymbols(client, rows) {
  if (!rows.length) return 0;

  const cols = [
    "symbol",
    "loose_variant",
    "english",
    "transposable",
    "represents_mana",
    "mana_value",
    "appears_in_mana_costs",
    "funny",
    "colors",
    "hybrid",
    "phyrexian",
    "gatherer_alternates",
    "svg_uri",
    "payload",
  ];

  const values = [];
  for (const row of rows) {
    for (const col of cols) values.push(row[col]);
  }

  const placeholders = buildRowPlaceholders(rows.length, cols.length, [
    "NOW()",
    "NOW()",
  ]);

  const sqlMissingOnly = `
    INSERT INTO public.scryfall_card_symbols (
      ${cols.join(", ")}, fetched_at, updated_at
    )
    VALUES
      ${placeholders}
    ON CONFLICT (symbol) DO NOTHING
  `;

  const sqlUpsert = `
    INSERT INTO public.scryfall_card_symbols (
      ${cols.join(", ")}, fetched_at, updated_at
    )
    VALUES
      ${placeholders}
    ON CONFLICT (symbol) DO UPDATE SET
      loose_variant = EXCLUDED.loose_variant,
      english = EXCLUDED.english,
      transposable = EXCLUDED.transposable,
      represents_mana = EXCLUDED.represents_mana,
      mana_value = EXCLUDED.mana_value,
      appears_in_mana_costs = EXCLUDED.appears_in_mana_costs,
      funny = EXCLUDED.funny,
      colors = EXCLUDED.colors,
      hybrid = EXCLUDED.hybrid,
      phyrexian = EXCLUDED.phyrexian,
      gatherer_alternates = EXCLUDED.gatherer_alternates,
      svg_uri = EXCLUDED.svg_uri,
      payload = EXCLUDED.payload,
      fetched_at = NOW(),
      updated_at = NOW()
  `;

  await client.query(MISSING_ONLY ? sqlMissingOnly : sqlUpsert, values);
  return rows.length;
}

async function syncSymbols(client) {
  console.log("🔣 Syncing symbols...");
  const payload = await fetchJson("https://api.scryfall.com/symbology");
  await sleep(REQUEST_DELAY_MS);

  if (!Array.isArray(payload?.data)) {
    throw new Error("Unexpected /symbology payload");
  }

  const rows = payload.data.map((sym) => ({
    symbol: String(sym.symbol),
    loose_variant: textOrNull(sym.loose_variant),
    english: String(sym.english),
    transposable: Boolean(sym.transposable),
    represents_mana: Boolean(sym.represents_mana),
    mana_value: numOrNull(sym.cmc),
    appears_in_mana_costs: Boolean(sym.appears_in_mana_costs),
    funny: Boolean(sym.funny),
    colors: arrText(sym.colors),
    hybrid: Boolean(sym.hybrid),
    phyrexian: Boolean(sym.phyrexian),
    gatherer_alternates: Array.isArray(sym.gatherer_alternates)
      ? sym.gatherer_alternates.map(String)
      : null,
    svg_uri: textOrNull(sym.svg_uri),
    payload: JSON.stringify(sym),
  }));

  const written = await upsertSymbols(client, rows);
  console.log(`✅ symbols: ${written}`);
}

async function upsertCatalog(client, row) {
  const sqlMissingOnly = `
    INSERT INTO public.scryfall_catalogs (
      key, endpoint, uri, total_values, data, payload, fetched_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    ON CONFLICT (key) DO NOTHING
  `;

  const sqlUpsert = `
    INSERT INTO public.scryfall_catalogs (
      key, endpoint, uri, total_values, data, payload, fetched_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    ON CONFLICT (key) DO UPDATE SET
      endpoint = EXCLUDED.endpoint,
      uri = EXCLUDED.uri,
      total_values = EXCLUDED.total_values,
      data = EXCLUDED.data,
      payload = EXCLUDED.payload,
      fetched_at = NOW(),
      updated_at = NOW()
  `;

  await client.query(MISSING_ONLY ? sqlMissingOnly : sqlUpsert, [
    row.key,
    row.endpoint,
    row.uri,
    row.total_values,
    row.data,
    row.payload,
  ]);
}

async function replaceCatalogValues(client, catalogKey, valueList) {
  if (!MISSING_ONLY) {
    await client.query(
      `DELETE FROM public.scryfall_catalog_values WHERE catalog_key = $1`,
      [catalogKey]
    );
  }

  if (!valueList.length) return 0;

  const sql = `
    INSERT INTO public.scryfall_catalog_values (
      catalog_key, value, fetched_at, updated_at
    )
    SELECT
      $1::text,
      v,
      NOW(),
      NOW()
    FROM unnest($2::text[]) AS v
    ON CONFLICT (catalog_key, value)
    DO UPDATE SET
      fetched_at = NOW(),
      updated_at = NOW()
  `;

  await client.query(sql, [catalogKey, valueList]);
  return valueList.length;
}

async function syncCatalogs(client) {
  console.log("🗂️ Syncing catalogs...");
  let catalogCount = 0;
  let valueCount = 0;

  for (const endpoint of CATALOG_ENDPOINTS) {
    const url = `https://api.scryfall.com/catalog/${endpoint}`;
    const payload = await fetchJson(url);
    await sleep(REQUEST_DELAY_MS);

    if (!Array.isArray(payload?.data)) {
      throw new Error(`Unexpected catalog payload for ${endpoint}`);
    }

    const row = {
      key: endpoint,
      endpoint,
      uri: String(payload.uri || url),
      total_values: payload.data.length,
      data: payload.data.map(String),
      payload: JSON.stringify(payload),
    };

    await upsertCatalog(client, row);
    const inserted = await replaceCatalogValues(
      client,
      endpoint,
      payload.data.map(String)
    );

    catalogCount += 1;
    valueCount += inserted;
    console.log(`   • ${endpoint}: ${payload.data.length}`);
  }

  console.log(`✅ catalogs: ${catalogCount}`);
  console.log(`✅ catalog values: ${valueCount}`);
}

async function upsertCardBatch(client, rows) {
  if (!rows.length) return 0;

  const cols = [
    "id",
    "oracle_id",
    "lang",
    "name",
    "layout",
    "set_code",
    "set_id",
    "collector_number",
    "released_at",
    "arena_id",
    "mtgo_id",
    "mtgo_foil_id",
    "tcgplayer_id",
    "tcgplayer_etched_id",
    "cardmarket_id",
    "payload",
  ];

  const values = [];
  for (const row of rows) {
    for (const col of cols) values.push(row[col]);
  }

  const placeholders = buildRowPlaceholders(rows.length, cols.length, [
    "NOW()",
    "NOW()",
  ]);

  const sqlMissingOnly = `
    INSERT INTO public.scryfall_cards_raw (
      ${cols.join(", ")}, fetched_at, updated_at
    )
    VALUES
      ${placeholders}
    ON CONFLICT (id) DO NOTHING
  `;

  const sqlUpsert = `
    INSERT INTO public.scryfall_cards_raw (
      ${cols.join(", ")}, fetched_at, updated_at
    )
    VALUES
      ${placeholders}
    ON CONFLICT (id) DO UPDATE SET
      oracle_id = EXCLUDED.oracle_id,
      lang = EXCLUDED.lang,
      name = EXCLUDED.name,
      layout = EXCLUDED.layout,
      set_code = EXCLUDED.set_code,
      set_id = EXCLUDED.set_id,
      collector_number = EXCLUDED.collector_number,
      released_at = EXCLUDED.released_at,
      arena_id = EXCLUDED.arena_id,
      mtgo_id = EXCLUDED.mtgo_id,
      mtgo_foil_id = EXCLUDED.mtgo_foil_id,
      tcgplayer_id = EXCLUDED.tcgplayer_id,
      tcgplayer_etched_id = EXCLUDED.tcgplayer_etched_id,
      cardmarket_id = EXCLUDED.cardmarket_id,
      payload = EXCLUDED.payload,
      fetched_at = NOW(),
      updated_at = NOW()
  `;

  await client.query(MISSING_ONLY ? sqlMissingOnly : sqlUpsert, values);
  return rows.length;
}

async function syncCards(client) {
  console.log("🃏 Syncing cards from bulk default_cards...");
  const downloadUri = await getBulkDownloadUri("default_cards");

  const tmpFile = path.join(
    os.tmpdir(),
    `scryfall-default-cards-${Date.now()}.json`
  );

  await downloadToFile(downloadUri, tmpFile);

  let seen = 0;
  let written = 0;
  let batch = [];

  const stream = createReadStream(tmpFile)
    .pipe(parser())
    .pipe(streamArray());

  for await (const chunk of stream) {
    const card = chunk?.value;
    seen += 1;

    if (!card || card.object !== "card" || !card.id) continue;

    batch.push({
      id: card.id,
      oracle_id: textOrNull(card.oracle_id),
      lang: String(card.lang || "en"),
      name: String(card.name || ""),
      layout: textOrNull(card.layout),
      set_code: textOrNull(card.set),
      set_id: textOrNull(card.set_id),
      collector_number: textOrNull(card.collector_number),
      released_at: dateOrNull(card.released_at),
      arena_id: intOrNull(card.arena_id),
      mtgo_id: intOrNull(card.mtgo_id),
      mtgo_foil_id: intOrNull(card.mtgo_foil_id),
      tcgplayer_id: intOrNull(card.tcgplayer_id),
      tcgplayer_etched_id: intOrNull(card.tcgplayer_etched_id),
      cardmarket_id: intOrNull(card.cardmarket_id),
      payload: JSON.stringify(card),
    });

    if (batch.length >= BATCH_SIZE) {
      written += await upsertCardBatch(client, batch);
      console.log(`[cards] seen=${seen} written=${written}`);
      batch = [];
    }
  }

  if (batch.length) {
    written += await upsertCardBatch(client, batch);
  }

  try {
    fs.unlinkSync(tmpFile);
  } catch {}

  console.log(`✅ cards: ${written}`);
}

async function upsertRulingBatch(client, rows) {
  if (!rows.length) return 0;

  const dedupedRows = dedupeRulingRows(rows);
  if (!dedupedRows.length) return 0;

  const cols = [
    "oracle_id",
    "source",
    "published_at",
    "comment",
    "comment_sha256",
  ];

  const values = [];
  for (const row of dedupedRows) {
    for (const col of cols) values.push(row[col]);
  }

  const placeholders = buildRowPlaceholders(dedupedRows.length, cols.length, [
    "NOW()",
    "NOW()",
  ]);

  const sqlMissingOnly = `
    INSERT INTO public.scryfall_rulings (
      ${cols.join(", ")}, fetched_at, updated_at
    )
    VALUES
      ${placeholders}
    ON CONFLICT (oracle_id, source, published_at, comment_sha256) DO NOTHING
  `;

  const sqlUpsert = `
    INSERT INTO public.scryfall_rulings (
      ${cols.join(", ")}, fetched_at, updated_at
    )
    VALUES
      ${placeholders}
    ON CONFLICT (oracle_id, source, published_at, comment_sha256)
    DO UPDATE SET
      comment = EXCLUDED.comment,
      fetched_at = NOW(),
      updated_at = NOW()
  `;

  await client.query(MISSING_ONLY ? sqlMissingOnly : sqlUpsert, values);
  return dedupedRows.length;
}

async function syncRulings(client) {
  console.log("📜 Syncing rulings from bulk rulings...");
  const downloadUri = await getBulkDownloadUri("rulings");

  const tmpFile = path.join(
    os.tmpdir(),
    `scryfall-rulings-${Date.now()}.json`
  );

  await downloadToFile(downloadUri, tmpFile);

  let seen = 0;
  let written = 0;
  let skipped = 0;
  let dedupedAway = 0;
  let batch = [];

  const flushBatch = async () => {
    if (!batch.length) return;

    const before = batch.length;
    const afterRows = dedupeRulingRows(batch);
    dedupedAway += before - afterRows.length;

    written += await upsertRulingBatch(client, afterRows);

    console.log(
      `[rulings] seen=${seen} written=${written} skipped=${skipped} deduped=${dedupedAway}`
    );

    batch = [];
  };

  const stream = createReadStream(tmpFile)
    .pipe(parser())
    .pipe(streamArray());

  for await (const chunk of stream) {
    const ruling = chunk?.value;
    seen += 1;

    if (
      !ruling ||
      ruling.object !== "ruling" ||
      !ruling.oracle_id ||
      !ruling.source ||
      !ruling.published_at ||
      !ruling.comment
    ) {
      skipped += 1;
      continue;
    }

    batch.push({
      oracle_id: ruling.oracle_id,
      source: String(ruling.source),
      published_at: String(ruling.published_at),
      comment: String(ruling.comment),
      comment_sha256: sha256(String(ruling.comment)),
    });

    if (batch.length >= BATCH_SIZE) {
      await flushBatch();
    }
  }

  await flushBatch();

  try {
    fs.unlinkSync(tmpFile);
  } catch {}

  console.log(`✅ rulings: ${written} (deduped away: ${dedupedAway})`);
}

async function main() {
  const started = Date.now();
  const client = await pool.connect();

  try {
    console.log("🚀 Starting full Scryfall reference sync");
    console.log(`MISSING_ONLY=${MISSING_ONLY ? "1" : "0"}`);
    console.log(`REQUEST_DELAY_MS=${REQUEST_DELAY_MS}`);
    console.log(`BATCH_SIZE=${BATCH_SIZE}`);

    if (!SKIP_SETS) await syncSets(client);
    if (!SKIP_SYMBOLS) await syncSymbols(client);
    if (!SKIP_CATALOGS) await syncCatalogs(client);
    if (!SKIP_CARDS) await syncCards(client);
    if (!SKIP_RULINGS) await syncRulings(client);

    const ms = Date.now() - started;
    console.log(`✅ All done in ${ms}ms`);
  } catch (error) {
    console.error("❌ Sync failed");
    console.error(error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();