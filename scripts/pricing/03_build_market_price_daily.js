#!/usr/bin/env node
/**
 * Build market_price_daily from market_price_snapshots
 *
 * - For each market_item_id + as_of_date + currency, pick the "best" snapshot via priority rules.
 * - UPSERT into market_price_daily.
 *
 * Usage:
 *   node scripts/pricing/03_build_market_price_daily.js
 *   node scripts/pricing/03_build_market_price_daily.js --date 2025-12-19
 *   node scripts/pricing/03_build_market_price_daily.js --currency USD
 *   node scripts/pricing/03_build_market_price_daily.js --all-dates
 *
 * Env:
 *   DATABASE_URL=postgres://...
 */

const { Client } = require("pg");

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL not set");
  process.exit(1);
}

/**
 * Priority rules:
 * Lower number = higher priority.
 * You can tweak these over time without changing schema.
 *
 * Within a source, we prefer:
 *   market > trend > mid > low/high > foil/etched (unless you decide otherwise)
 */
const SOURCE_PRIORITY = {
  tcgplayer: 10,
  scryfall: 20,
  cardmarket: 30,
  pricecharting: 40,
  ebay: 50,
  amazon: 60,
};

const PRICE_TYPE_PRIORITY = {
  market: 10,
  trend: 12,
  mid: 14,
  avg_7d: 16,
  avg_30d: 18,
  low: 22,
  high: 24,
  loose: 30,
  cib: 32,
  new: 34,
  graded: 36,
  foil: 60,
  etched: 62,
  tix: 80,
};

function toInt(n, fallback) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

(async function main() {
  const args = parseArgs(process.argv);

  const currency = (args.currency || "USD").toUpperCase();
  const asOfDate = args.date || new Date().toISOString().slice(0, 10);
  const allDates = !!args["all-dates"];

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  console.log(
    `📊 Building market_price_daily (${currency}) ` +
      (allDates ? "for ALL dates in snapshots" : `for ${asOfDate}`)
  );

  // We do this in SQL using a window function (fast).
  // Rank snapshots per (item,date,currency) by (source_priority, price_type_priority, value_cents desc).
  // Then take rn=1 and upsert into daily table.
  const sql = `
  WITH candidates AS (
    SELECT
      s.market_item_id,
      s.currency,
      s.value_cents,
      s.source,
      s.price_type,
      s.condition,
      s.raw,
      s.as_of_date AS snapshot_date,

      ROW_NUMBER() OVER (
        PARTITION BY s.market_item_id, s.currency
        ORDER BY
          -- newest snapshot wins first
          s.as_of_date DESC,

          -- then your source priority
          CASE s.source
            WHEN 'tcgplayer' THEN 10
            WHEN 'scryfall' THEN 20
            WHEN 'cardmarket' THEN 30
            WHEN 'pricecharting' THEN 40
            WHEN 'ebay' THEN 50
            WHEN 'amazon' THEN 60
            ELSE 99
          END ASC,

          -- then your price_type priority
          CASE s.price_type
            WHEN 'market' THEN 10
            WHEN 'trend' THEN 12
            WHEN 'mid' THEN 14
            WHEN 'avg_7d' THEN 16
            WHEN 'avg_30d' THEN 18
            WHEN 'low' THEN 22
            WHEN 'high' THEN 24
            WHEN 'loose' THEN 30
            WHEN 'cib' THEN 32
            WHEN 'new' THEN 34
            WHEN 'graded' THEN 36
            WHEN 'foil' THEN 60
            WHEN 'etched' THEN 62
            WHEN 'tix' THEN 80
            ELSE 90
          END ASC,

          -- and finally highest price as tie-breaker
          s.value_cents DESC
      ) AS rn
    FROM public.market_price_snapshots s
    WHERE s.currency = $1
      AND s.as_of_date <= $2
  ),

  best AS (
    SELECT
      market_item_id,
      $2::date AS as_of_date,         -- IMPORTANT: force output day
      currency,
      value_cents,
      70::int AS confidence,
      jsonb_build_array(
        jsonb_build_object(
          'source', source,
          'price_type', price_type,
          'condition', condition,
          'value_cents', value_cents,
          'snapshot_date', snapshot_date
        )
      ) AS sources_used,
      'priority_fallback'::text AS method
    FROM candidates
    WHERE rn = 1
  )

  INSERT INTO public.market_price_daily (
    market_item_id,
    as_of_date,
    currency,
    value_cents,
    confidence,
    sources_used,
    method,
    updated_at
  )
  SELECT
    market_item_id,
    as_of_date,
    currency,
    value_cents,
    confidence,
    sources_used,
    method,
    now()
  FROM best
  ON CONFLICT (market_item_id, as_of_date, currency)
  DO UPDATE SET
    value_cents = EXCLUDED.value_cents,
    confidence = EXCLUDED.confidence,
    sources_used = EXCLUDED.sources_used,
    method = EXCLUDED.method,
    updated_at = now()
  RETURNING 1;
`;


  const params = allDates ? [currency] : [currency, asOfDate];
  const res = await client.query(sql, params);

  await client.end();

  console.log(`✅ Upserted ${res.rowCount} daily rows into market_price_daily`);
})().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
