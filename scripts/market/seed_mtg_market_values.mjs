#!/usr/bin/env node
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    console.log("=== MTG market seed: start ===");

    const { rows } = await client.query(`
      SELECT
        scryfall_id,
        usd,
        usd_foil,
        usd_etched
      FROM public.mtg_prices_scryfall_latest
      WHERE
        (usd IS NOT NULL AND usd::numeric > 0)
        OR (usd_foil IS NOT NULL AND usd_foil::numeric > 0)
        OR (usd_etched IS NOT NULL AND usd_etched::numeric > 0)
    `);

    let inserted = 0;

    for (const r of rows) {
      const prices = [r.usd, r.usd_foil, r.usd_etched]
        .map(Number)
        .filter((n) => Number.isFinite(n) && n > 0);

      if (!prices.length) continue;

      const marketValue =
        prices.reduce((a, b) => a + b, 0) / prices.length;

      await client.query(
  `
  INSERT INTO market_prices_current (
    market_item_id,
    currency,
    price_cents,
    source,
    price_type,
    confidence,
    as_of_date,
    sources_used
  )
  SELECT
    mi.id,
    'USD',
    $1::int,
    'scryfall',
    'market',
    CASE
      WHEN $2 >= 3 THEN 'A'
      WHEN $2 = 2 THEN 'B'
      ELSE 'C'
    END,
    CURRENT_DATE,
    jsonb_build_object(
      'usd',        $3::numeric,
      'usd_foil',   $4::numeric,
      'usd_etched', $5::numeric
    )
  FROM public.market_items mi
  WHERE mi.game = 'mtg'
    AND mi.canonical_source = 'scryfall'
    AND mi.canonical_id = $6
  ON CONFLICT (market_item_id)
  DO UPDATE SET
    currency     = EXCLUDED.currency,
    price_cents  = EXCLUDED.price_cents,
    source       = EXCLUDED.source,
    price_type   = EXCLUDED.price_type,
    confidence   = EXCLUDED.confidence,
    as_of_date   = EXCLUDED.as_of_date,
    sources_used = EXCLUDED.sources_used,
    updated_at   = now();
  `,
  [
    Math.round(marketValue * 100), // $1
    prices.length,                 // $2
    r.usd,                          // $3
    r.usd_foil,                     // $4
    r.usd_etched,                   // $5
    r.scryfall_id,                  // $6
  ],
);

      inserted++;
    }

    console.log(`MTG seeded rows: ${inserted}`);
    console.log("=== MTG market seed: done ===");
  } finally {
    client.release();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
