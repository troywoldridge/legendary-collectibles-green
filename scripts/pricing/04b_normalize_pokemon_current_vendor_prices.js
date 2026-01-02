#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * scripts/pricing/04b_normalize_pokemon_current_vendor_prices.js
 *
 * Normalize Pokemon CURRENT vendor prices into market_price_snapshots
 *
 * Reads:
 *  - tcg_card_prices_tcgplayer
 *  - tcg_card_prices_cardmarket
 *
 * Joins to market_items via:
 *  market_items(game='pokemon', canonical_source='tcgdex', canonical_id = card_id)
 *
 * Writes:
 *  market_price_snapshots
 *
 * Usage:
 *  node scripts/pricing/04b_normalize_pokemon_current_vendor_prices.js
 *  node scripts/pricing/04b_normalize_pokemon_current_vendor_prices.js --date 2025-12-19
 *
 * Env:
 *  DATABASE_URL=postgres://...
 */

const pg = require("pg");
const { Pool } = pg;

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

function qIdent(id) {
  if (!/^[a-zA-Z0-9_]+$/.test(id)) throw new Error(`Unsafe identifier: ${id}`);
  return `"${id}"`;
}

function priceTypeFromCol(col) {
  const c = col.toLowerCase();
  if (c === "market_price" || c === "market") return "market";
  if (c === "trend_price" || c === "trend") return "trend";
  if (c === "low_price" || c === "low") return "low";
  if (c === "mid_price" || c === "mid") return "mid";
  if (c === "high_price" || c === "high") return "high";
  if (c === "avg1") return "avg_1d";
  if (c === "avg7") return "avg_7d";
  if (c === "avg30") return "avg_30d";
  if (c.includes("average_sell_price")) return "market";
  return c;
}

function conditionFromWideCol(col) {
  const c = col.toLowerCase();
  if (c.includes("reverse_holo")) return "reverse_holofoil";
  if (c.includes("holo")) return "holofoil";
  if (c.includes("first_edition")) return "first_edition";
  if (c === "normal") return "normal";
  return "";
}

async function getColumns(client, table) {
  const { rows } = await client.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name=$1
    ORDER BY ordinal_position
  `,
    [table],
  );
  return rows.map((r) => r.column_name);
}

async function normalizeCurrentTable(client, table, sourceName, asOfDateOverride) {
  const cols = await getColumns(client, table);
  const colSet = new Set(cols);

  const cardIdCol =
    colSet.has("card_id") ? "card_id" :
    colSet.has("cardid") ? "cardid" :
    null;

  if (!cardIdCol) throw new Error(`${table}: missing card_id/cardid column`);

  const hasVariantType = colSet.has("variant_type");
  const hasUpdatedAt = colSet.has("updated_at");
  const hasCurrency = colSet.has("currency");

  console.log(`\n🔎 ${table} (${sourceName})`);
  console.log(`   mode: ${hasVariantType ? "row-style (variant_type rows)" : "wide columns"}`);

  if (hasVariantType) {
    // Row-style: one row per card_id + variant_type, with market/low/mid/high/etc columns.
    const priceCols = ["market_price", "trend_price", "low_price", "mid_price", "high_price"].filter((c) => colSet.has(c));
    if (!priceCols.length) {
      console.log(`⚠️  ${table}: no price columns found; skipping`);
      return 0;
    }

    // Build UNION ALL per price column (set-based insert)
    const unions = priceCols
      .map((pc) => `
        SELECT
          mi.id AS market_item_id,
          '${sourceName}'::text AS source,
          ${
            asOfDateOverride
              ? `$1::date`
              : hasUpdatedAt
                ? `COALESCE(p.${qIdent("updated_at")}::date, CURRENT_DATE)`
                : `CURRENT_DATE`
          } AS as_of_date,
          ${hasCurrency ? `COALESCE(p.${qIdent("currency")}::text, 'USD')` : `'USD'`}::text AS currency,
          '${priceTypeFromCol(pc)}'::text AS price_type,
          COALESCE(p.${qIdent("variant_type")}::text, '')::text AS condition,
          p.${qIdent(pc)} AS raw_value,
          '${pc}'::text AS raw_col
        FROM public.${qIdent(table)} p
        JOIN public.market_items mi
          ON mi.game='pokemon'
         AND mi.canonical_source='tcgdex'
         AND mi.canonical_id = p.${qIdent(cardIdCol)}::text
      `)
      .join("\nUNION ALL\n");

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
        COALESCE(NULLIF(condition,''),'') AS condition,
        (NULLIF(regexp_replace(raw_value::text, '[^0-9.\\-]', '', 'g'), '')::numeric * 100)::integer AS value_cents,
        jsonb_build_object('table',$2::text,'column',raw_col,'raw_value',raw_value,'mode','row')
      FROM rows
      WHERE raw_value IS NOT NULL
        AND NULLIF(regexp_replace(raw_value::text, '[^0-9.\\-]', '', 'g'), '') IS NOT NULL
      ON CONFLICT DO NOTHING
    `;

    const params = asOfDateOverride ? [asOfDateOverride, table] : [table]; // keep placeholders aligned
    // We used $1 only if override, and $2 for table; if no override, we used $2 but then only 1 param.
    // So: normalize placeholders by always passing [dateOrNull, table] and referencing carefully:
    const fixedSql = asOfDateOverride
      ? sql
      : sql.replace(/\$2::text/g, "$1::text").replace(/\$1::date/g, "CURRENT_DATE");

    const res = await client.query(fixedSql, asOfDateOverride ? [asOfDateOverride, table] : [table]);
    console.log(`✅ inserted ${res.rowCount} snapshot rows from ${table}`);
    return res.rowCount;
  }

  // Wide-column mode (legacy “normal/holofoil/etc” columns)
  const excluded = new Set([cardIdCol, "id", "url", "currency", "updated_at"]);
  const priceCols = cols
    .filter((c) => !excluded.has(c))
    .filter((c) => /price|market|low|mid|high|trend|avg|holo|reverse|normal|first/i.test(c));

  if (!priceCols.length) {
    console.log(`⚠️  ${table}: no price-ish columns found; skipping`);
    return 0;
  }

  const unions = priceCols
    .map((col) => {
      const cond = conditionFromWideCol(col);

      // If col itself is a pure variant column (normal/holofoil...), treat as market
      let pt = priceTypeFromCol(col);
      if (["normal", "holofoil", "reverse_holofoil", "first_edition_holofoil", "first_edition_normal"].includes(col.toLowerCase())) {
        pt = "market";
      }

      // reverse_holo_avg7 -> condition reverse holo + price type avg7
      if (col.toLowerCase().includes("reverse_holo_")) {
        const suffix = col.toLowerCase().split("reverse_holo_")[1];
        pt = priceTypeFromCol(suffix);
      }

      const asOfExpr = asOfDateOverride
        ? `$1::date`
        : colSet.has("updated_at")
          ? `COALESCE(p.${qIdent("updated_at")}::date, CURRENT_DATE)`
          : `CURRENT_DATE`;

      const currencyExpr = colSet.has("currency")
        ? `COALESCE(p.${qIdent("currency")}::text, 'USD')`
        : `'USD'`;

      return `
        SELECT
          mi.id AS market_item_id,
          '${sourceName}'::text AS source,
          ${asOfExpr} AS as_of_date,
          ${currencyExpr}::text AS currency,
          '${pt}'::text AS price_type,
          '${cond}'::text AS condition,
          p.${qIdent(col)} AS raw_value,
          '${col}'::text AS raw_col
        FROM public.${qIdent(table)} p
        JOIN public.market_items mi
          ON mi.game='pokemon'
         AND mi.canonical_source='tcgdex'
         AND mi.canonical_id = p.${qIdent(cardIdCol)}::text
      `;
    })
    .join("\nUNION ALL\n");

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
      COALESCE(NULLIF(condition,''),'') AS condition,
      (NULLIF(regexp_replace(raw_value::text, '[^0-9.\\-]', '', 'g'), '')::numeric * 100)::integer AS value_cents,
      jsonb_build_object('table',$2::text,'column',raw_col,'raw_value',raw_value,'mode','wide')
    FROM rows
    WHERE raw_value IS NOT NULL
      AND NULLIF(regexp_replace(raw_value::text, '[^0-9.\\-]', '', 'g'), '') IS NOT NULL
    ON CONFLICT DO NOTHING
  `;

  const fixedSql = asOfDateOverride
    ? sql
    : sql.replace(/\$2::text/g, "$1::text").replace(/\$1::date/g, "CURRENT_DATE");

  const res = await client.query(fixedSql, asOfDateOverride ? [asOfDateOverride, table] : [table]);
  console.log(`✅ inserted ${res.rowCount} snapshot rows from ${table}`);
  return res.rowCount;
}

async function main() {
  const args = parseArgs(process.argv);
  const asOfDateOverride = args.date ? String(args.date) : null;

  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL not set");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  const client = await pool.connect();

  try {
    console.log("📥 Normalizing Pokémon CURRENT vendor prices into market_price_snapshots…");
    if (asOfDateOverride) console.log(`   as_of_date override: ${asOfDateOverride}`);

    const a = await normalizeCurrentTable(client, "tcg_card_prices_tcgplayer", "tcgplayer", asOfDateOverride);
    const b = await normalizeCurrentTable(client, "tcg_card_prices_cardmarket", "cardmarket", asOfDateOverride);

    console.log(`\n✅ Done. inserted total=${a + b}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("❌ Error:", e?.stack || e?.message || e);
  process.exit(1);
});
