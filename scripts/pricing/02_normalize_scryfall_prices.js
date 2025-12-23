#!/usr/bin/env node
/**
 * Normalize Scryfall MTG prices into market_price_snapshots
 *
 * Source: scryfall_cards_raw.payload.prices
 * Target: market_price_snapshots
 */

const { Client } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL not set");
  process.exit(1);
}

const PRICE_MAP = [
  { key: "usd", priceType: "market", currency: "USD" },
  { key: "usd_foil", priceType: "foil", currency: "USD" },
  { key: "usd_etched", priceType: "etched", currency: "USD" },
  { key: "eur", priceType: "market", currency: "EUR" },
  { key: "tix", priceType: "tix", currency: "TIX" },
];

(async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  const today = new Date().toISOString().slice(0, 10);

  console.log("📥 Normalizing Scryfall MTG prices for", today);

  const { rows } = await client.query(`
    SELECT
      mi.id AS market_item_id,
      scr.payload->'prices' AS prices
    FROM market_items mi
    JOIN scryfall_cards_raw scr
      ON mi.canonical_id = scr.id::text
    WHERE mi.game = 'mtg'
      AND scr.payload ? 'prices'
  `);

  let inserted = 0;

  for (const row of rows) {
    const prices = row.prices || {};

    for (const map of PRICE_MAP) {
      const val = prices[map.key];
      if (!val) continue;

      const cents = Math.round(parseFloat(val) * 100);
      if (!Number.isFinite(cents) || cents <= 0) continue;

      await client.query(
        `
        INSERT INTO market_price_snapshots (
          market_item_id,
          source,
          as_of_date,
          currency,
          price_type,
          value_cents,
          raw
        )
        VALUES ($1, 'scryfall', $2, $3, $4, $5, $6)
        ON CONFLICT DO NOTHING
        `,
        [
          row.market_item_id,
          today,
          map.currency,
          map.priceType,
          cents,
          prices,
        ]
      );

      inserted++;
    }
  }

  await client.end();
  console.log(`✅ Inserted ${inserted} Scryfall MTG price snapshots`);
})().catch((err) => {
  console.error("❌ Error normalizing Scryfall prices:", err);
  process.exit(1);
});
