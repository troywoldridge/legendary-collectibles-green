#!/usr/bin/env node
/**
 * Normalize Pokemon vendor price history into market_price_snapshots
 *
 * Reads:
 *  - tcg_card_prices_tcgplayer_history
 *  - tcg_card_prices_cardmarket_history
 *
 * Joins to market_items via:
 *  market_items(game='pokemon', canonical_source='tcgdex', canonical_id = tcg_cards.id)
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

async function getColumns(client, table) {
  const { rows } = await client.query(
    `
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name=$1
    ORDER BY ordinal_position
  `,
    [table]
  );
  return rows; // [{column_name, data_type}, ...]
}

function pickFirst(set, candidates) {
  for (const c of candidates) if (set.has(c)) return c;
  return null;
}

function isDateType(dt) {
  const t = (dt || "").toLowerCase();
  return t === "date" || t.includes("timestamp");
}

function chooseDateColumn(cols) {
  // Prefer columns that are clearly "as of" / "priced at" / "snapshot"
  const preferredNames = [
    "as_of_date",
    "as_of",
    "price_date",
    "priced_at",
    "snapshot_date",
    "snapshot_at",
    "captured_at",
    "collected_at",
    "observed_at",
    "recorded_at",
    "created_at",
    "updated_at",
    "date",
    "day",
  ];

  const byName = new Map(cols.map((c) => [c.column_name, c.data_type]));
  const nameSet = new Set(byName.keys());

  for (const n of preferredNames) {
    if (nameSet.has(n) && isDateType(byName.get(n))) return n;
  }

  // Fallback: first date/timestamp column we can find
  for (const c of cols) {
    if (isDateType(c.data_type)) return c.column_name;
  }

  return null;
}

function priceTypeFor(col) {
  const c = col.toLowerCase();
  if (c.includes("low")) return "low";
  if (c.includes("mid")) return "mid";
  if (c.includes("high")) return "high";
  if (c.includes("trend")) return "trend";
  if (c.includes("market")) return "market";
  return col;
}

async function normalizeOneTable(client, table, sourceName) {
  const cols = await getColumns(client, table);
  const colSet = new Set(cols.map((c) => c.column_name));

  const cardIdCol = pickFirst(colSet, ["card_id", "cardid", "tcg_card_id", "tcgcard_id", "id"]);
  if (!cardIdCol) throw new Error(`${table}: cannot find card id column (tried card_id/cardid/tcg_card_id/id)`);

  const dateCol = chooseDateColumn(cols);
  if (!dateCol) {
    throw new Error(`${table}: cannot find any date/timestamp column. Add one or tell me its name.`);
  }

  // Price-ish columns: take anything that looks like a price (but exclude ids + timestamps)
  const excluded = new Set([cardIdCol, dateCol, "id", "cardmarket_id", "tcgplayer_id", "oracle_id"]);
  const priceCols = cols
    .map((c) => c.column_name)
    .filter((c) => !excluded.has(c))
    .filter((c) => /price|market|low|mid|high|trend|avg|foil|etched/i.test(c));

  if (priceCols.length === 0) {
    throw new Error(
      `${table}: no recognizable price columns. I looked for columns containing price/market/low/mid/high/trend/avg/foil/etched.`
    );
  }

  console.log(`\n🔎 ${table}`);
  console.log(`   card id col: ${cardIdCol}`);
  console.log(`   date col:    ${dateCol}`);
  console.log(`   price cols:  ${priceCols.slice(0, 12).join(", ")}${priceCols.length > 12 ? " …" : ""}`);

  // Build UNION ALL rows so we can insert each price column as a normalized snapshot row.
  const unions = priceCols
    .map(
      (col) => `
      SELECT
        market_item_id,
        '${sourceName}'::text AS source,
        as_of_date,
        'USD'::text AS currency,
        '${priceTypeFor(col)}'::text AS price_type,
        NULL::text AS condition,
        ${col} AS raw_value,
        '${col}'::text AS raw_col
      FROM src
    `
    )
    .join("UNION ALL");

  const sql = `
    WITH src AS (
      SELECT
        mi.id AS market_item_id,
        -- coerce timestamp/date into date
        (h.${dateCol})::date AS as_of_date,
        h.*
      FROM public.${table} h
      JOIN public.market_items mi
        ON mi.game='pokemon'
       AND mi.canonical_source='tcgdex'
       AND mi.canonical_id = h.${cardIdCol}::text
      WHERE h.${dateCol} IS NOT NULL
    ),
    rows AS (
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
      -- parse numeric from raw_value (handles "$12.34", "12.34", 12.34, "1,234.56")
      (NULLIF(regexp_replace(raw_value::text, '[^0-9.\\-]', '', 'g'), '')::numeric * 100)::integer AS value_cents,
      jsonb_build_object('table', $1::text, 'column', raw_col, 'raw_value', raw_value)
    FROM rows
    WHERE raw_value IS NOT NULL
      AND NULLIF(regexp_replace(raw_value::text, '[^0-9.\\-]', '', 'g'), '') IS NOT NULL
    ON CONFLICT DO NOTHING
  `;

  const res = await client.query(sql, [table]);
  console.log(`✅ inserted ${res.rowCount} snapshot rows from ${table}`);
}

async function main() {
  const client = await getClient();
  try {
    console.log("📥 Normalizing Pokémon price history into market_price_snapshots…");

    await normalizeOneTable(client, "tcg_card_prices_tcgplayer_history", "tcgplayer");
    await normalizeOneTable(client, "tcg_card_prices_cardmarket_history", "cardmarket");

    console.log("\n✅ Done.");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("❌ Error:", e.message);
  process.exit(1);
});
