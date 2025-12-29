#!/usr/bin/env node
import "dotenv/config";
import axios from "axios";
import pg from "pg";

const { Client } = pg;

const TCGDEX_API_URL = "https://api.tcgdex.net/v2/en/cards";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set. Put it in .env.local or export it in your shell.`);
  return v;
}

const dbClient = new Client({
  connectionString: requireEnv("DATABASE_URL"),
});

const http = axios.create({
  baseURL: TCGDEX_API_URL,
  timeout: 30_000,
  headers: { "User-Agent": "legendary-collectibles-tcgdex-variants" },
});

// -----------------------
// utils
// -----------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(path, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await http.get(path);
      return res.data;
    } catch (err) {
      lastErr = err;
      const status = err?.response?.status;
      // Retry on network issues, 429, 5xx
      const retryable = !status || status === 429 || (status >= 500 && status < 600);
      if (!retryable) break;

      const backoff = 500 * Math.pow(2, i);
      await sleep(backoff);
    }
  }
  throw lastErr;
}

function normalizeVariantType(v) {
  switch (v) {
    case "normal":
      return "normal";
    case "reverse":
      return "reverse_holofoil";
    case "holo":
      return "holofoil";
    case "firstEdition":
      return "first_edition";
    default:
      return String(v);
  }
}

function toNumberOrNull(x) {
  if (x === undefined || x === null) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

// -----------------------
// schema setup
// -----------------------
async function ensureSchema() {
  await dbClient.query(`
    CREATE TABLE IF NOT EXISTS public.tcg_card_variants (
      card_id text PRIMARY KEY,
      normal boolean,
      reverse boolean,
      holo boolean,
      first_edition boolean,
      w_promo boolean,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  // Ensure cardmarket has UNIQUE(card_id)
  await dbClient.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tcg_card_prices_cardmarket_card_id_uniq'
      ) THEN
        ALTER TABLE public.tcg_card_prices_cardmarket
        ADD CONSTRAINT tcg_card_prices_cardmarket_card_id_uniq UNIQUE (card_id);
      END IF;
    END $$;
  `);
}

// -----------------------
// DB reads
// -----------------------
async function getAllCardIdsFromDb() {
  const res = await dbClient.query(`SELECT id FROM public.tcg_cards ORDER BY id;`);
  return res.rows.map((r) => r.id);
}

// -----------------------
// upserts
// -----------------------
async function upsertVariants(card) {
  const id = card?.id;
  const v = card?.variants || {};
  if (!id) return;

  const q = `
    INSERT INTO public.tcg_card_variants
      (card_id, normal, reverse, holo, first_edition, w_promo)
    VALUES
      ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (card_id)
    DO UPDATE SET
      normal = EXCLUDED.normal,
      reverse = EXCLUDED.reverse,
      holo = EXCLUDED.holo,
      first_edition = EXCLUDED.first_edition,
      w_promo = EXCLUDED.w_promo,
      updated_at = now();
  `;

  await dbClient.query(q, [
    id,
    Boolean(v.normal),
    Boolean(v.reverse),
    Boolean(v.holo),
    Boolean(v.firstEdition),
    Boolean(v.wPromo),
  ]);
}

async function upsertTcgplayerPrices(card) {
  const id = card?.id;
  const tp = card?.pricing?.tcgplayer;
  if (!id || !tp) return;

  const keys = ["normal", "reverse", "holo", "firstEdition"];
  for (const key of keys) {
    const data = tp?.[key];
    if (!data) continue;

    const low = toNumberOrNull(data.lowPrice);
    const mid = toNumberOrNull(data.midPrice);
    const high = toNumberOrNull(data.highPrice);
    const market = toNumberOrNull(data.marketPrice);

    const variantType = normalizeVariantType(key);

    const q = `
      INSERT INTO public.tcg_card_prices_tcgplayer
        (card_id, variant_type, low_price, mid_price, high_price, market_price)
      VALUES
        ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (card_id, variant_type)
      DO UPDATE SET
        low_price = EXCLUDED.low_price,
        mid_price = EXCLUDED.mid_price,
        high_price = EXCLUDED.high_price,
        market_price = EXCLUDED.market_price;
    `;

    await dbClient.query(q, [id, variantType, low, mid, high, market]);
  }
}

async function upsertCardmarketRow(card) {
  const id = card?.id;
  const cm = card?.pricing?.cardmarket;
  if (!id || !cm) return;

  const url = cm.url ?? null;
  const updatedAt = cm.updatedAt ?? cm.updated_at ?? null;

  const averageSellPrice = cm.averageSellPrice ?? cm.average_sell_price ?? cm.avgSellPrice ?? null;
  const lowPrice = cm.lowPrice ?? cm.low ?? cm.low_price ?? null;
  const trendPrice = cm.trendPrice ?? cm.trend ?? cm.trend_price ?? null;

  const reverseHoloSell = cm.reverseHoloSell ?? cm.reverse_holo_sell ?? null;
  const reverseHoloLow = cm.reverseHoloLow ?? cm.reverse_holo_low ?? null;
  const reverseHoloTrend = cm.reverseHoloTrend ?? cm.reverse_holo_trend ?? null;

  const q = `
    INSERT INTO public.tcg_card_prices_cardmarket (
      card_id,
      url,
      updated_at,
      average_sell_price,
      low_price,
      trend_price,
      reverse_holo_sell,
      reverse_holo_low,
      reverse_holo_trend
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (card_id)
    DO UPDATE SET
      url = EXCLUDED.url,
      updated_at = EXCLUDED.updated_at,
      average_sell_price = EXCLUDED.average_sell_price,
      low_price = EXCLUDED.low_price,
      trend_price = EXCLUDED.trend_price,
      reverse_holo_sell = EXCLUDED.reverse_holo_sell,
      reverse_holo_low = EXCLUDED.reverse_holo_low,
      reverse_holo_trend = EXCLUDED.reverse_holo_trend;
  `;

  await dbClient.query(q, [
    id,
    url,
    updatedAt,
    averageSellPrice,
    lowPrice,
    trendPrice,
    reverseHoloSell,
    reverseHoloLow,
    reverseHoloTrend,
  ]);
}

// -----------------------
// concurrency runner
// -----------------------
async function runPool(items, concurrency, worker) {
  let idx = 0;
  let ok = 0;
  let fail = 0;

  async function next() {
    while (idx < items.length) {
      const i = idx++;
      const item = items[i];
      try {
        await worker(item, i);
        ok++;
      } catch (err) {
        fail++;
        console.error(`[FAIL] ${item}:`, err?.message || err);
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => next());
  await Promise.all(workers);

  return { ok, fail };
}

// -----------------------
// main
// -----------------------
async function syncOneCard(cardId) {
  // tcgdex endpoint expects /:id
  const card = await fetchWithRetry(`/${encodeURIComponent(cardId)}`, 3);
  if (!card) return;

  await upsertVariants(card);
  await upsertTcgplayerPrices(card);
  await upsertCardmarketRow(card);
}

async function main() {
  const concurrency = Number(process.env.TCGDEX_CONCURRENCY || "4"); // safe default
  await dbClient.connect();

  try {
    await ensureSchema();

    const ids = await getAllCardIdsFromDb();
    console.log(`Found ${ids.length} card IDs in public.tcg_cards`);

    const { ok, fail } = await runPool(ids, concurrency, async (cardId, i) => {
      // light progress logging
      if (i % 250 === 0) console.log(`Progress: ${i}/${ids.length}`);
      await syncOneCard(cardId);
    });

    console.log(`Done. OK=${ok} FAIL=${fail}`);
  } finally {
    await dbClient.end();
  }
}

main().catch((err) => {
  console.error("Fatal:", err?.message || err);
  process.exit(1);
});
