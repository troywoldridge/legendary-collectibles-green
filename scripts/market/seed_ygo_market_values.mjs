#!/usr/bin/env node
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    console.log("=== YGO market seed: start ===");

    const { rows } = await client.query(`
      SELECT
        card_id,
        tcgplayer_price,
        ebay_price,
        amazon_price,
        coolstuffinc_price,
        cardmarket_price
      FROM public.ygo_card_prices
      WHERE
        tcgplayer_price > 0
        OR ebay_price > 0
        OR amazon_price > 0
        OR coolstuffinc_price > 0
        OR cardmarket_price > 0
    `);

    let upserted = 0;

    for (const r of rows) {
      const prices = [
        r.tcgplayer_price,
        r.ebay_price,
        r.amazon_price,
        r.coolstuffinc_price,
        r.cardmarket_price,
      ]
        .map(Number)
        .filter((n) => Number.isFinite(n) && n > 0);

      if (!prices.length) continue;

      const marketValue = prices.reduce((a, b) => a + b, 0) / prices.length;

      await client.query(
        `
        INSERT INTO public.market_prices_current (
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
          'aggregate',
          'market',
          CASE
            WHEN $2 >= 4 THEN 'A'
            WHEN $2 >= 2 THEN 'B'
            ELSE 'C'
          END,
          CURRENT_DATE,
          jsonb_build_object(
            'tcgplayer',     $3::numeric,
            'ebay',          $4::numeric,
            'amazon',        $5::numeric,
            'coolstuffinc',  $6::numeric,
            'cardmarket',    $7::numeric
          )
        FROM public.market_items mi
        WHERE mi.game = 'yugioh'
          AND mi.canonical_id = $8
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
          r.tcgplayer_price,             // $3
          r.ebay_price,                  // $4
          r.amazon_price,                // $5
          r.coolstuffinc_price,          // $6
          r.cardmarket_price,            // $7
          r.card_id,                     // $8
        ],
      );

      upserted++;
    }

    console.log(`YGO upserted rows: ${upserted}`);
    console.log("=== YGO market seed: done ===");
  } finally {
    client.release();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
