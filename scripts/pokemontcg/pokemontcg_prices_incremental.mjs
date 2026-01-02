#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * scripts/pokemontcg/pokemontcg_prices_incremental.mjs
 *
 * Incremental price refresher for PokemonTCG API:
 * - Queries cards updated on a date (tcgplayer.updatedAt / cardmarket.updatedAt)
 * - Upserts current price tables
 * - Inserts history snapshots (best-effort dedupe by card_id + source_updated_at)
 *
 * Usage:
 *   node scripts/pokemontcg/pokemontcg_prices_incremental.mjs
 *   node scripts/pokemontcg/pokemontcg_prices_incremental.mjs --date 2025/12/28
 *
 * Env:
 *   POKEMON_TCG_API_KEY (optional but recommended)
 *   DATABASE_URL (required for DB)
 */

import "dotenv/config";
import pg from "pg";

const { Client } = pg;

const API_BASE = "https://api.pokemontcg.io/v2";
const API_KEY = process.env.POKEMON_TCG_API_KEY || "";
const DATABASE_URL = process.env.DATABASE_URL || "";

if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL in env");
  process.exit(1);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) args[key] = true;
      else {
        args[key] = next;
        i++;
      }
    } else args._.push(a);
  }
  return args;
}

function isoUtcDateToYmdSlash(d = new Date()) {
  // UTC date -> YYYY/MM/DD
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

function ymdSlashToTimestamptz(ymd) {
  // "YYYY/MM/DD" -> timestamptz at midnight UTC
  // store as ISO string; pg will cast correctly
  const iso = ymd.replaceAll("/", "-") + "T00:00:00.000Z";
  const dt = new Date(iso);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

function numOrNull(v) {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url, { maxRetries = 8, label = "" } = {}) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
        },
      });

      if (res.status === 429 || res.status >= 500) {
        const txt = await res.text().catch(() => "");
        if (attempt === maxRetries) {
          throw new Error(`HTTP ${res.status} after retries (${label}): ${txt.slice(0, 300)}`);
        }
        const ra = Number(res.headers.get("retry-after") || "");
        const wait = Number.isFinite(ra) ? ra * 1000 : Math.min(30000, 500 * (attempt + 1) ** 2);
        console.warn(`[retry] ${label} -> HTTP ${res.status}. waiting ${wait}ms`);
        await sleep(wait);
        continue;
      }

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.statusText} (${label}): ${txt.slice(0, 300)}`);
      }

      return await res.json();
    } catch (e) {
      if (attempt === maxRetries) throw e;
      const wait = Math.min(30000, 500 * (attempt + 1) ** 2);
      console.warn(`[retry] ${label} error: ${e?.message || e}. waiting ${wait}ms`);
      await sleep(wait);
    }
  }
  throw new Error("unreachable");
}

function buildCardsUrl({ q, page, pageSize }) {
  // Keep payload small; we only need pricing blobs + id
  const select = [
    "id",
    "name",
    "set.id",
    "tcgplayer",
    "cardmarket",
  ].join(",");

  return (
    `${API_BASE}/cards?` +
    new URLSearchParams({
      q,
      page: String(page),
      pageSize: String(pageSize),
      select,
    }).toString()
  );
}

async function* fetchAllCardsByQuery({ q, pageSize = 250 }) {
  let page = 1;
  while (true) {
    const url = buildCardsUrl({ q, page, pageSize });
    const json = await fetchJson(url, { label: `cards q=${q} page=${page}` });

    const data = Array.isArray(json?.data) ? json.data : [];
    const count = Number(json?.count ?? data.length);
    const totalCount = Number(json?.totalCount ?? 0);

    yield { page, count, totalCount, data };

    if (!count || data.length === 0) return;
    // if we got fewer than pageSize, assume end
    if (data.length < pageSize) return;

    page++;
  }
}

/* ---------------- DB Upserts ---------------- */

async function upsertTcgplayerNow(client, rows) {
  // rows: {card_id, url, updated_at, normal, holofoil, reverse_holofoil, first_edition_holofoil, first_edition_normal, currency}
  if (!rows.length) return 0;

  const cols = 9;
  const params = [];
  const values = rows
    .map((r, idx) => {
      const b = idx * cols;
      params.push(
        r.card_id,
        r.url,
        r.updated_at,
        r.normal,
        r.holofoil,
        r.reverse_holofoil,
        r.first_edition_holofoil,
        r.first_edition_normal,
        r.currency
      );
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9})`;
    })
    .join(",");

  await client.query(
    `
    INSERT INTO tcg_card_prices_tcgplayer
      (card_id, url, updated_at, normal, holofoil, reverse_holofoil, first_edition_holofoil, first_edition_normal, currency)
    VALUES ${values}
    ON CONFLICT (card_id) DO UPDATE SET
      url = EXCLUDED.url,
      updated_at = EXCLUDED.updated_at,
      normal = EXCLUDED.normal,
      holofoil = EXCLUDED.holofoil,
      reverse_holofoil = EXCLUDED.reverse_holofoil,
      first_edition_holofoil = EXCLUDED.first_edition_holofoil,
      first_edition_normal = EXCLUDED.first_edition_normal,
      currency = EXCLUDED.currency
    `,
    params
  );

  return rows.length;
}

async function upsertCardmarketNow(client, rows) {
  if (!rows.length) return 0;

  const cols = 18;
  const params = [];
  const values = rows
    .map((r, idx) => {
      const b = idx * cols;
      params.push(
        r.card_id,
        r.url,
        r.updated_at,
        r.average_sell_price,
        r.low_price,
        r.trend_price,
        r.german_pro_low,
        r.suggested_price,
        r.reverse_holo_sell,
        r.reverse_holo_low,
        r.reverse_holo_trend,
        r.low_price_ex_plus,
        r.avg1,
        r.avg7,
        r.avg30,
        r.reverse_holo_avg1,
        r.reverse_holo_avg7,
        r.reverse_holo_avg30
      );
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},$${b + 14},$${b + 15},$${b + 16},$${b + 17},$${b + 18})`;
    })
    .join(",");

  await client.query(
    `
    INSERT INTO tcg_card_prices_cardmarket
      (card_id, url, updated_at, average_sell_price, low_price, trend_price, german_pro_low, suggested_price,
       reverse_holo_sell, reverse_holo_low, reverse_holo_trend, low_price_ex_plus,
       avg1, avg7, avg30, reverse_holo_avg1, reverse_holo_avg7, reverse_holo_avg30)
    VALUES ${values}
    ON CONFLICT (card_id) DO UPDATE SET
      url = EXCLUDED.url,
      updated_at = EXCLUDED.updated_at,
      average_sell_price = EXCLUDED.average_sell_price,
      low_price = EXCLUDED.low_price,
      trend_price = EXCLUDED.trend_price,
      german_pro_low = EXCLUDED.german_pro_low,
      suggested_price = EXCLUDED.suggested_price,
      reverse_holo_sell = EXCLUDED.reverse_holo_sell,
      reverse_holo_low = EXCLUDED.reverse_holo_low,
      reverse_holo_trend = EXCLUDED.reverse_holo_trend,
      low_price_ex_plus = EXCLUDED.low_price_ex_plus,
      avg1 = EXCLUDED.avg1,
      avg7 = EXCLUDED.avg7,
      avg30 = EXCLUDED.avg30,
      reverse_holo_avg1 = EXCLUDED.reverse_holo_avg1,
      reverse_holo_avg7 = EXCLUDED.reverse_holo_avg7,
      reverse_holo_avg30 = EXCLUDED.reverse_holo_avg30
    `,
    params
  );

  return rows.length;
}

async function insertTcgplayerHistory(client, rows) {
  if (!rows.length) return 0;

  // Filter bad rows (no timestamp)
  const clean = rows.filter((r) => r.card_id && r.source_updated_at);
  if (!clean.length) return 0;

  const cols = 8;
  const params = [];
  const values = clean
    .map((r, idx) => {
      const b = idx * cols;
      params.push(
        r.card_id,
        r.source_updated_at,
        r.currency,
        r.normal,
        r.holofoil,
        r.reverse_holofoil,
        r.first_edition_holofoil,
        r.first_edition_normal
      );
      return `($${b + 1},$${b + 2}::timestamptz,$${b + 3},$${b + 4}::numeric,$${b + 5}::numeric,$${b + 6}::numeric,$${b + 7}::numeric,$${b + 8}::numeric)`;
    })
    .join(",");

  const res = await client.query(
    `
    INSERT INTO public.tcg_card_prices_tcgplayer_history
      (card_id, source_updated_at, currency, normal, holofoil, reverse_holofoil, first_edition_holofoil, first_edition_normal)
    VALUES ${values}
    ON CONFLICT (card_id, source_updated_at) DO NOTHING
    `,
    params
  );

  return res.rowCount || 0;
}


async function insertCardmarketHistory(client, rows) {
  if (!rows.length) return 0;

  const clean = rows.filter((r) => r.card_id && r.source_updated_at);
  if (!clean.length) return 0;

  const cols = 17;
  const params = [];
  const values = clean
    .map((r, idx) => {
      const b = idx * cols;
      params.push(
        r.card_id,
        r.source_updated_at,
        r.average_sell_price,
        r.low_price,
        r.trend_price,
        r.german_pro_low,
        r.suggested_price,
        r.reverse_holo_sell,
        r.reverse_holo_low,
        r.reverse_holo_trend,
        r.low_price_ex_plus,
        r.avg1,
        r.avg7,
        r.avg30,
        r.reverse_holo_avg1,
        r.reverse_holo_avg7,
        r.reverse_holo_avg30
      );
      return `($${b + 1},$${b + 2}::timestamptz,$${b + 3}::numeric,$${b + 4}::numeric,$${b + 5}::numeric,$${b + 6}::numeric,$${b + 7}::numeric,$${b + 8}::numeric,$${b + 9}::numeric,$${b + 10}::numeric,$${b + 11}::numeric,$${b + 12}::numeric,$${b + 13}::numeric,$${b + 14}::numeric,$${b + 15}::numeric,$${b + 16}::numeric,$${b + 17}::numeric)`;
    })
    .join(",");

  const res = await client.query(
    `
    INSERT INTO public.tcg_card_prices_cardmarket_history
      (card_id, source_updated_at,
       average_sell_price, low_price, trend_price, german_pro_low, suggested_price,
       reverse_holo_sell, reverse_holo_low, reverse_holo_trend, low_price_ex_plus,
       avg1, avg7, avg30, reverse_holo_avg1, reverse_holo_avg7, reverse_holo_avg30)
    VALUES ${values}
    ON CONFLICT (card_id, source_updated_at) DO NOTHING
    `,
    params
  );

  return res.rowCount || 0;
}


/* ---------------- Transform helpers ---------------- */

function extractTcgplayerRow(card) {
  const t = card?.tcgplayer;
  if (!t) return null;

  const prices = t.prices || {};
  const pickMarket = (k) => {
    const obj = prices?.[k];
    if (!obj) return null;
    const m = obj.market ?? obj.mid ?? obj.low ?? null;
    return m == null ? null : String(m);
  };

  return {
    card_id: card.id,
    url: t.url ?? null,
    updated_at: t.updatedAt ?? null, // stored as TEXT in your table
    normal: pickMarket("normal"),
    holofoil: pickMarket("holofoil"),
    reverse_holofoil: pickMarket("reverseHolofoil"),
    first_edition_holofoil: pickMarket("1stEditionHolofoil"),
    first_edition_normal: pickMarket("1stEditionNormal"),
    currency: "USD",
  };
}

function extractTcgplayerHistRow(card) {
  const t = card?.tcgplayer;
  if (!t) return null;

  const prices = t.prices || {};
  const pickMarketNum = (k) => {
    const obj = prices?.[k];
    if (!obj) return null;
    const m = obj.market ?? obj.mid ?? obj.low ?? null;
    return numOrNull(m);
  };

  const ymd = t.updatedAt || null; // "YYYY/MM/DD"
  const source_updated_at = ymd ? ymdSlashToTimestamptz(ymd) : null;

  return {
    card_id: card.id,
    source_updated_at,
    currency: "USD",
    normal: pickMarketNum("normal"),
    holofoil: pickMarketNum("holofoil"),
    reverse_holofoil: pickMarketNum("reverseHolofoil"),
    first_edition_holofoil: pickMarketNum("1stEditionHolofoil"),
    first_edition_normal: pickMarketNum("1stEditionNormal"),
  };
}

function extractCardmarketRow(card) {
  const c = card?.cardmarket;
  if (!c) return null;

  const p = c.prices || {};
  const s = (v) => (v == null ? null : String(v));

  return {
    card_id: card.id,
    url: c.url ?? null,
    updated_at: c.updatedAt ?? null, // TEXT in your table
    average_sell_price: s(p.averageSellPrice),
    low_price: s(p.lowPrice),
    trend_price: s(p.trendPrice),
    german_pro_low: s(p.germanProLow),
    suggested_price: s(p.suggestedPrice),
    reverse_holo_sell: s(p.reverseHoloSell),
    reverse_holo_low: s(p.reverseHoloLow),
    reverse_holo_trend: s(p.reverseHoloTrend),
    low_price_ex_plus: s(p.lowPriceExPlus),
    avg1: s(p.avg1),
    avg7: s(p.avg7),
    avg30: s(p.avg30),
    reverse_holo_avg1: s(p.reverseHoloAvg1),
    reverse_holo_avg7: s(p.reverseHoloAvg7),
    reverse_holo_avg30: s(p.reverseHoloAvg30),
  };
}

function extractCardmarketHistRow(card) {
  const c = card?.cardmarket;
  if (!c) return null;

  const p = c.prices || {};
  const ymd = c.updatedAt || null;
  const source_updated_at = ymd ? ymdSlashToTimestamptz(ymd) : null;

  return {
    card_id: card.id,
    source_updated_at,
    average_sell_price: numOrNull(p.averageSellPrice),
    low_price: numOrNull(p.lowPrice),
    trend_price: numOrNull(p.trendPrice),
    german_pro_low: numOrNull(p.germanProLow),
    suggested_price: numOrNull(p.suggestedPrice),
    reverse_holo_sell: numOrNull(p.reverseHoloSell),
    reverse_holo_low: numOrNull(p.reverseHoloLow),
    reverse_holo_trend: numOrNull(p.reverseHoloTrend),
    low_price_ex_plus: numOrNull(p.lowPriceExPlus),
    avg1: numOrNull(p.avg1),
    avg7: numOrNull(p.avg7),
    avg30: numOrNull(p.avg30),
    reverse_holo_avg1: numOrNull(p.reverseHoloAvg1),
    reverse_holo_avg7: numOrNull(p.reverseHoloAvg7),
    reverse_holo_avg30: numOrNull(p.reverseHoloAvg30),
  };
}

/* ---------------- Main run ---------------- */

async function runForQuery({ client, q, label }) {
  const seen = new Set(); // card ids
  let totalFetched = 0;

  // batch upserts to keep it fast
  const NOW_BATCH = 5000;

  let tcgNow = [];
  let cmNow = [];
  let tcgHist = [];
  let cmHist = [];

  const flush = async () => {
    if (!tcgNow.length && !cmNow.length && !tcgHist.length && !cmHist.length) return;

    await client.query("BEGIN");
    try {
      const upT = await upsertTcgplayerNow(client, tcgNow);
      const upC = await upsertCardmarketNow(client, cmNow);

      const insTH = await insertTcgplayerHistory(client, tcgHist);
      const insCH = await insertCardmarketHistory(client, cmHist);

      await client.query("COMMIT");

      console.log(
        `[db] ${label} flush: tcg_now=${upT} cm_now=${upC} tcg_hist+${insTH} cm_hist+${insCH}`
      );
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }

    tcgNow = [];
    cmNow = [];
    tcgHist = [];
    cmHist = [];
  };

  for await (const page of fetchAllCardsByQuery({ q, pageSize: 250 })) {
    totalFetched += page.data.length;

    for (const card of page.data) {
      if (!card?.id) continue;
      if (seen.has(card.id)) continue;
      seen.add(card.id);

      const tNow = extractTcgplayerRow(card);
      const cNow = extractCardmarketRow(card);
      if (tNow) tcgNow.push(tNow);
      if (cNow) cmNow.push(cNow);

      const tH = extractTcgplayerHistRow(card);
      const cH = extractCardmarketHistRow(card);
      // only keep history rows with a real source_updated_at
      if (tH?.source_updated_at) tcgHist.push(tH);
      if (cH?.source_updated_at) cmHist.push(cH);

      if (tcgNow.length + cmNow.length >= NOW_BATCH) {
        await flush();
      }
    }

    console.log(
      `[fetch] ${label} page ${page.page}: got ${page.data.length} (running total ${totalFetched})`
    );
  }

  await flush();

  return { totalFetched, unique: seen.size };
}

async function main() {
  const args = parseArgs(process.argv);
  const date = String(args.date || "").trim() || isoUtcDateToYmdSlash(new Date());

  // Option C: both
  const qTcg = `tcgplayer.updatedAt:"${date}*"`;
  const qCm = `cardmarket.updatedAt:"${date}*"`;

  console.log(`[prices] date=${date} (TCGplayer primary; syncing both)`);
  console.log(`[prices] q1=${qTcg}`);
  console.log(`[prices] q2=${qCm}`);

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    const r1 = await runForQuery({ client, q: qTcg, label: "tcgplayer.updatedAt" });
    const r2 = await runForQuery({ client, q: qCm, label: "cardmarket.updatedAt" });

    console.log(
      `[done] fetched: tcg=${r1.totalFetched} (${r1.unique} unique), cm=${r2.totalFetched} (${r2.unique} unique)`
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Failed:", err?.stack || err?.message || String(err));
  process.exit(1);
});
