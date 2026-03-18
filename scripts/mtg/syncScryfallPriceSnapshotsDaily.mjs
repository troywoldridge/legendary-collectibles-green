#!/usr/bin/env node

/**
 * Daily Scryfall price snapshot sync
 *
 * Lean daily snapshot design:
 * - stores only identifiers, print metadata, numeric daily prices
 * - stores prices_raw JSON only
 * - does NOT store full raw card JSON
 *
 * Required env:
 *   DATABASE_URL=postgres://...
 *
 * Optional env:
 *   SCRYFALL_USER_AGENT=LegendaryCollectibles/1.0
 *   BATCH_SIZE=500
 *   REQUEST_DELAY_MS=75
 *   SNAPSHOT_DATE=2026-03-06
 *   ONLY_WITH_PRICES=1
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
  console.error("Missing DATABASE_URL");
  process.exit(1);
}

const SCRYFALL_USER_AGENT =
  process.env.SCRYFALL_USER_AGENT || "LegendaryCollectibles/1.0";
const BATCH_SIZE = Number(process.env.BATCH_SIZE || 500);
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 75);
const ONLY_WITH_PRICES =
  String(process.env.ONLY_WITH_PRICES || "1").trim() !== "0";

const SNAPSHOT_DATE =
  process.env.SNAPSHOT_DATE || new Date().toISOString().slice(0, 10);

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 5,
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function numOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function textOrNull(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

function dateOrNull(value) {
  if (!value || typeof value !== "string") return null;
  return value;
}

function arrOrEmpty(value) {
  return Array.isArray(value) ? value.map(String) : [];
}

function hasAnyPrice(prices) {
  if (!prices || typeof prices !== "object") return false;
  return [
    prices.usd,
    prices.usd_foil,
    prices.usd_etched,
    prices.eur,
    prices.eur_foil,
    prices.eur_etched,
    prices.tix,
  ].some((v) => v !== null && v !== undefined && v !== "");
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

async function ensureTableExists(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.skryfall_price_snapshots_daily (
      id BIGSERIAL PRIMARY KEY,

      snapshot_date DATE NOT NULL,
      source_updated_at TIMESTAMPTZ NULL,
      ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      scryfall_id UUID NOT NULL,
      oracle_id UUID NULL,
      tcgplayer_id INTEGER NULL,
      tcgplayer_etched_id INTEGER NULL,
      cardmarket_id INTEGER NULL,

      lang TEXT NOT NULL,
      name TEXT NOT NULL,
      printed_name TEXT NULL,
      set_code TEXT NOT NULL,
      set_name TEXT NOT NULL,
      set_id UUID NULL,
      collector_number TEXT NOT NULL,
      rarity TEXT NULL,
      released_at DATE NULL,

      layout TEXT NULL,
      type_line TEXT NULL,
      reprint BOOLEAN NOT NULL DEFAULT FALSE,
      digital BOOLEAN NOT NULL DEFAULT FALSE,
      promo BOOLEAN NOT NULL DEFAULT FALSE,
      reserved BOOLEAN NOT NULL DEFAULT FALSE,
      games TEXT[] NOT NULL DEFAULT '{}',
      finishes TEXT[] NOT NULL DEFAULT '{}',

      usd NUMERIC(12,2) NULL,
      usd_foil NUMERIC(12,2) NULL,
      usd_etched NUMERIC(12,2) NULL,
      eur NUMERIC(12,2) NULL,
      eur_foil NUMERIC(12,2) NULL,
      eur_etched NUMERIC(12,2) NULL,
      tix NUMERIC(12,2) NULL,

      has_any_price BOOLEAN NOT NULL DEFAULT FALSE,

      prices_raw JSONB NOT NULL DEFAULT '{}'::jsonb,
      purchase_uris JSONB NULL,
      source_uri TEXT NULL,
      scryfall_uri TEXT NULL,

      CONSTRAINT uq_skryfall_price_snapshots_daily
        UNIQUE (snapshot_date, scryfall_id)
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_skryfall_price_snapshots_daily_snapshot_date
    ON public.skryfall_price_snapshots_daily (snapshot_date DESC);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_skryfall_price_snapshots_daily_scryfall_id
    ON public.skryfall_price_snapshots_daily (scryfall_id);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_skryfall_price_snapshots_daily_oracle_id
    ON public.skryfall_price_snapshots_daily (oracle_id);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_skryfall_price_snapshots_daily_tcgplayer_id
    ON public.skryfall_price_snapshots_daily (tcgplayer_id);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_skryfall_price_snapshots_daily_cardmarket_id
    ON public.skryfall_price_snapshots_daily (cardmarket_id);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_skryfall_price_snapshots_daily_set_code_number
    ON public.skryfall_price_snapshots_daily (set_code, collector_number);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_skryfall_price_snapshots_daily_has_any_price
    ON public.skryfall_price_snapshots_daily (snapshot_date DESC, has_any_price);
  `);
}

function toRow(card, sourceUpdatedAt) {
  const prices =
    card?.prices && typeof card.prices === "object" ? card.prices : {};

  return {
    snapshot_date: SNAPSHOT_DATE,
    source_updated_at: sourceUpdatedAt,

    scryfall_id: card.id,
    oracle_id: textOrNull(card.oracle_id),
    tcgplayer_id: intOrNull(card.tcgplayer_id),
    tcgplayer_etched_id: intOrNull(card.tcgplayer_etched_id),
    cardmarket_id: intOrNull(card.cardmarket_id),

    lang: String(card.lang || "en"),
    name: String(card.name || ""),
    printed_name: textOrNull(card.printed_name),
    set_code: String(card.set || ""),
    set_name: String(card.set_name || ""),
    set_id: textOrNull(card.set_id),
    collector_number: String(card.collector_number || ""),
    rarity: textOrNull(card.rarity),
    released_at: dateOrNull(card.released_at),

    layout: textOrNull(card.layout),
    type_line: textOrNull(card.type_line),
    reprint: Boolean(card.reprint),
    digital: Boolean(card.digital),
    promo: Boolean(card.promo),
    reserved: Boolean(card.reserved),
    games: arrOrEmpty(card.games),
    finishes: arrOrEmpty(card.finishes),

    usd: numOrNull(prices.usd),
    usd_foil: numOrNull(prices.usd_foil),
    usd_etched: numOrNull(prices.usd_etched),
    eur: numOrNull(prices.eur),
    eur_foil: numOrNull(prices.eur_foil),
    eur_etched: numOrNull(prices.eur_etched),
    tix: numOrNull(prices.tix),

    has_any_price: hasAnyPrice(prices),

    prices_raw: JSON.stringify(prices || {}),
    purchase_uris: card.purchase_uris ? JSON.stringify(card.purchase_uris) : null,
    source_uri: textOrNull(card.uri),
    scryfall_uri: textOrNull(card.scryfall_uri),
  };
}

async function upsertBatch(client, rows) {
  if (!rows.length) return 0;

  const cols = [
    "snapshot_date",
    "source_updated_at",
    "scryfall_id",
    "oracle_id",
    "tcgplayer_id",
    "tcgplayer_etched_id",
    "cardmarket_id",
    "lang",
    "name",
    "printed_name",
    "set_code",
    "set_name",
    "set_id",
    "collector_number",
    "rarity",
    "released_at",
    "layout",
    "type_line",
    "reprint",
    "digital",
    "promo",
    "reserved",
    "games",
    "finishes",
    "usd",
    "usd_foil",
    "usd_etched",
    "eur",
    "eur_foil",
    "eur_etched",
    "tix",
    "has_any_price",
    "prices_raw",
    "purchase_uris",
    "source_uri",
    "scryfall_uri",
  ];

  const values = [];
  const placeholders = rows.map((row, rowIndex) => {
    const base = rowIndex * cols.length;
    cols.forEach((col) => values.push(row[col]));
    const ph = cols.map((_, colIndex) => `$${base + colIndex + 1}`).join(", ");
    return `(${ph})`;
  });

  const sql = `
    INSERT INTO public.skryfall_price_snapshots_daily (
      ${cols.join(", ")}
    )
    VALUES
      ${placeholders.join(",\n")}
    ON CONFLICT (snapshot_date, scryfall_id)
    DO UPDATE SET
      source_updated_at = EXCLUDED.source_updated_at,
      oracle_id = EXCLUDED.oracle_id,
      tcgplayer_id = EXCLUDED.tcgplayer_id,
      tcgplayer_etched_id = EXCLUDED.tcgplayer_etched_id,
      cardmarket_id = EXCLUDED.cardmarket_id,
      lang = EXCLUDED.lang,
      name = EXCLUDED.name,
      printed_name = EXCLUDED.printed_name,
      set_code = EXCLUDED.set_code,
      set_name = EXCLUDED.set_name,
      set_id = EXCLUDED.set_id,
      collector_number = EXCLUDED.collector_number,
      rarity = EXCLUDED.rarity,
      released_at = EXCLUDED.released_at,
      layout = EXCLUDED.layout,
      type_line = EXCLUDED.type_line,
      reprint = EXCLUDED.reprint,
      digital = EXCLUDED.digital,
      promo = EXCLUDED.promo,
      reserved = EXCLUDED.reserved,
      games = EXCLUDED.games,
      finishes = EXCLUDED.finishes,
      usd = EXCLUDED.usd,
      usd_foil = EXCLUDED.usd_foil,
      usd_etched = EXCLUDED.usd_etched,
      eur = EXCLUDED.eur,
      eur_foil = EXCLUDED.eur_foil,
      eur_etched = EXCLUDED.eur_etched,
      tix = EXCLUDED.tix,
      has_any_price = EXCLUDED.has_any_price,
      prices_raw = EXCLUDED.prices_raw,
      purchase_uris = EXCLUDED.purchase_uris,
      source_uri = EXCLUDED.source_uri,
      scryfall_uri = EXCLUDED.scryfall_uri,
      ingested_at = NOW()
  `;

  await client.query(sql, values);
  return rows.length;
}

async function main() {
  const started = Date.now();
  const client = await pool.connect();

  try {
    console.log(`Starting Scryfall daily price snapshot sync for ${SNAPSHOT_DATE}`);
    console.log(`ONLY_WITH_PRICES=${ONLY_WITH_PRICES ? "1" : "0"}`);
    console.log(`BATCH_SIZE=${BATCH_SIZE}`);
    console.log(`REQUEST_DELAY_MS=${REQUEST_DELAY_MS}`);

    await ensureTableExists(client);

    const bulkCatalog = await fetchJson("https://api.scryfall.com/bulk-data");
    await sleep(REQUEST_DELAY_MS);

    if (!bulkCatalog?.data || !Array.isArray(bulkCatalog.data)) {
      throw new Error("Unexpected response from Scryfall bulk-data catalog");
    }

    const defaultCards = bulkCatalog.data.find(
      (item) => item?.type === "default_cards"
    );

    if (!defaultCards?.download_uri) {
      throw new Error("Could not find default_cards download_uri in bulk-data");
    }

    const sourceUpdatedAt = defaultCards.updated_at || null;
    const downloadUri = defaultCards.download_uri;

    console.log(`Bulk type: ${defaultCards.type}`);
    console.log(`Source updated_at: ${sourceUpdatedAt}`);
    console.log(`Downloading: ${downloadUri}`);

    const tmpFile = path.join(
      os.tmpdir(),
      `scryfall-default-cards-${Date.now()}.json`
    );

    await downloadToFile(downloadUri, tmpFile);
    console.log(`Downloaded to ${tmpFile}`);

    let seen = 0;
    let kept = 0;
    let written = 0;
    let skippedNoPrice = 0;
    let batch = [];

    const stream = createReadStream(tmpFile)
      .pipe(parser())
      .pipe(streamArray());

    for await (const chunk of stream) {
      const card = chunk?.value;
      seen += 1;

      if (!card || card.object !== "card" || !card.id) {
        continue;
      }

      const row = toRow(card, sourceUpdatedAt);

      if (ONLY_WITH_PRICES && !row.has_any_price) {
        skippedNoPrice += 1;
        continue;
      }

      kept += 1;
      batch.push(row);

      if (batch.length >= BATCH_SIZE) {
        const count = await upsertBatch(client, batch);
        written += count;
        console.log(
          `[progress] seen=${seen} kept=${kept} written=${written} skippedNoPrice=${skippedNoPrice}`
        );
        batch = [];
      }
    }

    if (batch.length) {
      const count = await upsertBatch(client, batch);
      written += count;
    }

    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // ignore temp cleanup errors
    }

    const ms = Date.now() - started;

    console.log("Done");
    console.log(
      JSON.stringify(
        {
          ok: true,
          snapshot_date: SNAPSHOT_DATE,
          seen,
          kept,
          written,
          skippedNoPrice,
          ms,
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error("Sync failed");
    console.error(error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();