#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * 05_build_market_prices_current.js
 *
 * Builds a single “current best price” row per market_item into market_prices_current
 * using market_price_daily as the input.
 *
 * Your market_price_daily columns (confirmed):
 *   market_item_id, as_of_date, currency, value_cents, confidence, sources_used, method, created_at, updated_at
 *
 * Your market_prices_current columns:
 *   market_item_id (PK), currency, price_cents, source, price_type, confidence, as_of_date, sources_used, updated_at
 *
 * Usage:
 *   node scripts/pricing/05_build_market_prices_current.js --currency USD
 *   node scripts/pricing/05_build_market_prices_current.js --currency USD --as-of 2025-12-19
 *
 * Env:
 *   DATABASE_URL=postgres://...
 */

const { Client } = require("pg");

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const k = a.slice(2);
    const v = argv[i + 1];
    if (!v || v.startsWith("--")) out[k] = true;
    else {
      out[k] = v;
      i++;
    }
  }
  return out;
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function main() {
  const args = parseArgs(process.argv);

  const currency = (args.currency || "USD").toUpperCase();
  const asOf = args["as-of"] || args.asOf || todayISO();

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error("❌ DATABASE_URL not set");
    process.exit(1);
  }

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  console.log(`⭐ Building market_prices_current for currency=${currency} as_of=${asOf}`);

  try {
    // This query:
    // - Filters market_price_daily to <= as_of
    // - Chooses ONE “winner” row per market_item_id using a sane preference order
    // - Derives:
    //    source     = method (fallback 'unknown')
    //    price_type = 'market' (for now; later we can get fancy)
    //    confidence = coerced to 'high'|'medium'|'low' even if daily.confidence is numeric-ish or null
    const sql = `
      WITH ranked AS (
        SELECT
          d.market_item_id,
          d.as_of_date,
          d.currency,
          d.value_cents,
          COALESCE(NULLIF(d.method::text, ''), 'unknown') AS source,
          'market'::text AS price_type,

          CASE
            WHEN d.confidence IS NULL THEN 'medium'
            WHEN d.confidence::text IN ('high','medium','low') THEN d.confidence::text
            WHEN d.confidence::text ~ '^[0-9]+(\\.[0-9]+)?$' THEN
              CASE
                WHEN (d.confidence::numeric) >= 0.80 THEN 'high'
                WHEN (d.confidence::numeric) >= 0.50 THEN 'medium'
                ELSE 'low'
              END
            ELSE 'medium'
          END AS confidence_text,

          COALESCE(d.sources_used, '{}'::jsonb) AS sources_used,
          d.updated_at,

          ROW_NUMBER() OVER (
            PARTITION BY d.market_item_id
            ORDER BY
              d.as_of_date DESC,
              -- preference order: blended first, then tcgplayer, cardmarket, scryfall, pricecharting, ebay, amazon, unknown
              CASE COALESCE(d.method::text, '')
                WHEN 'blended'      THEN 0
                WHEN 'tcgplayer'    THEN 1
                WHEN 'cardmarket'   THEN 2
                WHEN 'scryfall'     THEN 3
                WHEN 'pricecharting'THEN 4
                WHEN 'ebay'         THEN 5
                WHEN 'amazon'       THEN 6
                ELSE 50
              END,
              d.updated_at DESC
          ) AS rn
        FROM public.market_price_daily d
        WHERE d.currency = $1
          AND d.as_of_date <= $2::date
          AND d.value_cents IS NOT NULL
      )
      INSERT INTO public.market_prices_current (
        market_item_id,
        currency,
        price_cents,
        source,
        price_type,
        confidence,
        as_of_date,
        sources_used,
        updated_at
      )
      SELECT
        market_item_id,
        currency,
        value_cents AS price_cents,
        source,
        price_type,
        confidence_text AS confidence,
        as_of_date,
        sources_used,
        NOW() AS updated_at
      FROM ranked
      WHERE rn = 1
      ON CONFLICT (market_item_id) DO UPDATE SET
        currency     = EXCLUDED.currency,
        price_cents  = EXCLUDED.price_cents,
        source       = EXCLUDED.source,
        price_type   = EXCLUDED.price_type,
        confidence   = EXCLUDED.confidence,
        as_of_date   = EXCLUDED.as_of_date,
        sources_used = EXCLUDED.sources_used,
        updated_at   = NOW()
      ;
    `;

    const res = await client.query(sql, [currency, asOf]);

    // NOTE: node-postgres rowCount for INSERT..SELECT..ON CONFLICT can be funky depending on updates vs inserts,
    // but it's still a good quick signal.
    console.log(`✅ market_prices_current built/updated (rowCount reported: ${res.rowCount})`);

    // Optional: show how many current rows exist for this currency
    const { rows } = await client.query(
      `SELECT COUNT(*)::int AS n FROM public.market_prices_current WHERE currency = $1`,
      [currency]
    );
    console.log(`📌 market_prices_current rows for ${currency}: ${rows[0]?.n ?? "?"}`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("❌ Error:", e?.message || e);
  process.exit(1);
});
