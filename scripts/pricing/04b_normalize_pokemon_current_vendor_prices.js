#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Normalize Pokemon CURRENT vendor prices into market_price_snapshots
 *
 * Reads:
 *  - tcg_card_prices_tcgplayer
 *  - tcg_card_prices_cardmarket
 *
 * Joins to market_items via:
 *  market_items(game='pokemon', canonical_source='tcgdex', canonical_id = card_id)
 *
 * Writes to:
 *  market_price_snapshots (source=tcgplayer/cardmarket, price_type = column name)
 *
 * Env:
 *  DATABASE_URL=postgres://...
 */

const pg = require("pg");

async function getClient() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  return c;
}

function priceTypeFor(col) {
  const c = col.toLowerCase();
  // pokemon specifics
  if (c.includes("holo")) return "holofoil";
  if (c.includes("reverse")) return "reverse_holofoil";
  if (c.includes("first_edition")) return "first_edition";
  if (c === "normal") return "normal";
  // generic
  if (c.includes("low")) return "low";
  if (c.includes("mid")) return "mid";
  if (c.includes("high")) return "high";
  if (c.includes("trend")) return "trend";
  if (c.includes("market")) return "market";
  return col;
}

async function normalizeTcgplayer(client) {
  console.log("\n🔎 tcg_card_prices_tcgplayer -> snapshots");

  // Pick columns that exist in your schema
  // You showed: normal, holofoil, reverse_holofoil, first_edition_holofoil, first_edition_normal, currency, updated_at, url
  const priceCols = [
    "normal",
    "holofoil",
    "reverse_holofoil",
    "first_edition_holofoil",
    "first_edition_normal",
  ];

  const unions = priceCols
    .map(
      (col) => `
      SELECT
        mi.id AS market_item_id,
        'tcgplayer'::text AS source,
        COALESCE(p.updated_at::date, CURRENT_DATE) AS as_of_date,
        COALESCE(p.currency, 'USD')::text AS currency,
        '${priceTypeFor(col)}'::text AS price_type,
        NULL::text AS condition,
        p.${col} AS raw_value,
        '${col}'::text AS raw_col
      FROM public.tcg_card_prices_tcgplayer p
      JOIN public.market_items mi
        ON mi.game='pokemon'
       AND mi.canonical_source='tcgdex'
       AND mi.canonical_id = p.card_id::text
    `
    )
    .join("UNION ALL");

  const sql = `
    WITH rows AS (
      ${unions}
    )
    INSERT INTO public.market_price_snapshots
      (market_item_id, source, as_of_date, currency, price_type, condition, value_cents, raw)
    SELECT
      market_item_id,
      source,
      as_of_date,
      currency,
      price_type,
      condition,
      (NULLIF(regexp_replace(raw_value::text, '[^0-9.\\-]', '', 'g'), '')::numeric * 100)::integer AS value_cents,
      jsonb_build_object('table','tcg_card_prices_tcgplayer','column',raw_col,'raw_value',raw_value)
    FROM rows
    WHERE raw_value IS NOT NULL
      AND NULLIF(regexp_replace(raw_value::text, '[^0-9.\\-]', '', 'g'), '') IS NOT NULL
    ON CONFLICT DO NOTHING
  `;

  const res = await client.query(sql);
  console.log(`✅ inserted ${res.rowCount} snapshot rows (tcgplayer current)`);
}

async function normalizeCardmarket(client) {
  console.log("\n🔎 tcg_card_prices_cardmarket -> snapshots");

  // Your current table has many columns; normalize the ones that matter most
  const priceCols = [
    "average_sell_price",
    "low_price",
    "trend_price",
    "german_pro_low",
    "suggested_price",
    "reverse_holo_sell",
    "reverse_holo_low",
    "reverse_holo_trend",
    "avg1",
    "avg7",
    "avg30",
    "reverse_holo_avg1",
    "reverse_holo_avg7",
    "reverse_holo_avg30",
  ];

  const unions = priceCols
    .map(
      (col) => `
      SELECT
        mi.id AS market_item_id,
        'cardmarket'::text AS source,
        COALESCE(p.updated_at::date, CURRENT_DATE) AS as_of_date,
        'USD'::text AS currency,
        '${priceTypeFor(col)}'::text AS price_type,
        NULL::text AS condition,
        p.${col} AS raw_value,
        '${col}'::text AS raw_col
      FROM public.tcg_card_prices_cardmarket p
      JOIN public.market_items mi
        ON mi.game='pokemon'
       AND mi.canonical_source='tcgdex'
       AND mi.canonical_id = p.card_id::text
    `
    )
    .join("UNION ALL");

  const sql = `
    WITH rows AS (
      ${unions}
    )
    INSERT INTO public.market_price_snapshots
      (market_item_id, source, as_of_date, currency, price_type, condition, value_cents, raw)
    SELECT
      market_item_id,
      source,
      as_of_date,
      currency,
      price_type,
      condition,
      (NULLIF(regexp_replace(raw_value::text, '[^0-9.\\-]', '', 'g'), '')::numeric * 100)::integer AS value_cents,
      jsonb_build_object('table','tcg_card_prices_cardmarket','column',raw_col,'raw_value',raw_value)
    FROM rows
    WHERE raw_value IS NOT NULL
      AND NULLIF(regexp_replace(raw_value::text, '[^0-9.\\-]', '', 'g'), '') IS NOT NULL
    ON CONFLICT DO NOTHING
  `;

  const res = await client.query(sql);
  console.log(`✅ inserted ${res.rowCount} snapshot rows (cardmarket current)`);
}

async function main() {
  const client = await getClient();
  try {
    console.log("📥 Normalizing Pokémon CURRENT vendor prices into market_price_snapshots…");
    await normalizeTcgplayer(client);
    await normalizeCardmarket(client);
    console.log("\n✅ Done.");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("❌ Error:", e.message);
  process.exit(1);
});
