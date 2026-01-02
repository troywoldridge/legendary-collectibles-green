#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * scripts/pricing/04_normalize_pokemon_vendor_prices.js
 *
 * Normalize Pokemon VENDOR PRICE HISTORY into market_price_snapshots
 *
 * Reads:
 *  - tcg_card_prices_tcgplayer_history (HYBRID: legacy columns + row-style variant rows)
 *  - tcg_card_prices_cardmarket_history (column-style)
 *
 * Joins to market_items via:
 *  market_items(game='pokemon', canonical_source='tcgdex', canonical_id = <card_id>)
 *
 * Writes:
 *  market_price_snapshots
 *
 * Usage:
 *  node scripts/pricing/04_normalize_pokemon_vendor_prices.js
 *  node scripts/pricing/04_normalize_pokemon_vendor_prices.js --date 2026-01-01
 *  node scripts/pricing/04_normalize_pokemon_vendor_prices.js --all-dates --since 2025-12-01
 *
 * Env:
 *  DATABASE_URL=postgres://...
 */

const pg = require("pg");

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

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} not set`);
  return v;
}

function quoteIdent(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new Error(`Unsafe identifier: ${name}`);
  return `"${name}"`;
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function priceTypeFromMetricCol(col) {
  if (col === "market_price") return "market";
  if (col === "low_price") return "low";
  if (col === "mid_price") return "mid";
  if (col === "high_price") return "high";
  return col;
}

function priceTypeFromCardmarketCol(col) {
  const c = col.toLowerCase();
  if (c.includes("trend")) return "trend";
  if (c.includes("low")) return "low";
  if (c === "avg1" || c.includes("avg1")) return "avg_1d";
  if (c === "avg7" || c.includes("avg7")) return "avg_7d";
  if (c === "avg30" || c.includes("avg30")) return "avg_30d";
  if (c.includes("suggested")) return "suggested";
  // average_sell_price, reverse_holo_sell etc -> treat as market
  return "market";
}

function conditionFromLegacyTcgplayerCol(col) {
  // legacy tcgplayer history columns represent “variant”
  if (col === "normal") return "normal";
  if (col === "holofoil") return "holofoil";
  if (col === "reverse_holofoil") return "reverse_holofoil";
  if (col === "first_edition_holofoil") return "first_edition_holofoil";
  if (col === "first_edition_normal") return "first_edition_normal";
  return null;
}

function conditionFromCardmarketCol(col) {
  const c = col.toLowerCase();
  // reverse holo columns should carry condition=reverse_holofoil
  if (c.includes("reverse_holo")) return "reverse_holofoil";
  return null; // everything else: condition null
}

async function normalizeTcgplayerHistory(client, opts) {
  const table = "tcg_card_prices_tcgplayer_history";
  const qTable = quoteIdent(table);

  const allDates = !!opts.allDates;
  const asOfDate = opts.date || todayYmd();
  const since = opts.since || null;

  const where = [];
  const params = [];

  // date filter uses source_updated_at when available, else captured_at
  // but your schema has source_updated_at; we’ll key off that primarily, fallback to captured_at
  const dateExpr = `COALESCE(h.source_updated_at, h.captured_at)::date`;

  if (!allDates) {
    params.push(asOfDate);
    where.push(`${dateExpr} = $${params.length}::date`);
  }
  if (since) {
    params.push(since);
    where.push(`${dateExpr} >= $${params.length}::date`);
  }

  const whereSql = where.length ? `AND ${where.join(" AND ")}` : "";

  console.log(`\n🔎 ${table} (tcgplayer)`);
  console.log(`   mode: HYBRID (row-style + legacy)`);
  console.log(
    `   filter: ${
      allDates ? (since ? `ALL dates since ${since}` : "ALL dates") : `date=${asOfDate}`
    }`,
  );

  // --- PART A: Row-style rows (variant_type + low/mid/high/market)
  const metricCols = ["low_price", "mid_price", "high_price", "market_price"];
  const rowStyleUnions = metricCols
    .map((mc) => {
      const pt = priceTypeFromMetricCol(mc);
      return `
        SELECT
          mi.id AS market_item_id,
          'tcgplayer'::text AS source,
          ${dateExpr} AS as_of_date,
          COALESCE(h.currency::text, 'USD')::text AS currency,
          '${pt}'::text AS price_type,
          NULLIF(h.variant_type::text, '')::text AS condition,
          h.${quoteIdent(mc)} AS raw_value,
          '${mc}'::text AS raw_col,
          'row_style'::text AS mode
        FROM public.${qTable} h
        JOIN public.market_items mi
          ON mi.game='pokemon'
         AND mi.canonical_source='tcgdex'
         AND mi.canonical_id = h.card_id::text
        WHERE h.card_id IS NOT NULL
          AND (h.source_updated_at IS NOT NULL OR h.captured_at IS NOT NULL)
          AND h.variant_type IS NOT NULL
          AND h.${quoteIdent(mc)} IS NOT NULL
          ${whereSql}
      `;
    })
    .join("\nUNION ALL\n");

  // --- PART B: Legacy rows (variant_type IS NULL) using legacy columns as “market” snapshots
  const legacyCols = [
    "normal",
    "holofoil",
    "reverse_holofoil",
    "first_edition_holofoil",
    "first_edition_normal",
  ];

  const legacyUnions = legacyCols
    .map((lc) => {
      const cond = conditionFromLegacyTcgplayerCol(lc);
      return `
        SELECT
          mi.id AS market_item_id,
          'tcgplayer'::text AS source,
          ${dateExpr} AS as_of_date,
          COALESCE(h.currency::text, 'USD')::text AS currency,
          'market'::text AS price_type,
          '${cond}'::text AS condition,
          h.${quoteIdent(lc)} AS raw_value,
          '${lc}'::text AS raw_col,
          'legacy_cols'::text AS mode
        FROM public.${qTable} h
        JOIN public.market_items mi
          ON mi.game='pokemon'
         AND mi.canonical_source='tcgdex'
         AND mi.canonical_id = h.card_id::text
        WHERE h.card_id IS NOT NULL
          AND (h.source_updated_at IS NOT NULL OR h.captured_at IS NOT NULL)
          AND h.variant_type IS NULL
          AND h.${quoteIdent(lc)} IS NOT NULL
          ${whereSql}
      `;
    })
    .join("\nUNION ALL\n");

  const sql = `
    WITH rows AS (
      ${rowStyleUnions}
      UNION ALL
      ${legacyUnions}
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
      jsonb_build_object(
        'table', '${table}',
        'column', raw_col,
        'raw_value', raw_value,
        'mode', mode
      )
    FROM rows
    WHERE NULLIF(regexp_replace(raw_value::text, '[^0-9.\\-]', '', 'g'), '') IS NOT NULL
    ON CONFLICT DO NOTHING
  `;

  const res = await client.query(sql, params);
  console.log(`✅ inserted ${res.rowCount} snapshot rows from ${table}`);
  return res.rowCount || 0;
}

async function normalizeCardmarketHistory(client, opts) {
  const table = "tcg_card_prices_cardmarket_history";
  const qTable = quoteIdent(table);

  const allDates = !!opts.allDates;
  const asOfDate = opts.date || todayYmd();
  const since = opts.since || null;

  const where = [];
  const params = [];

  const dateExpr = `COALESCE(h.source_updated_at, h.captured_at)::date`;

  if (!allDates) {
    params.push(asOfDate);
    where.push(`${dateExpr} = $${params.length}::date`);
  }
  if (since) {
    params.push(since);
    where.push(`${dateExpr} >= $${params.length}::date`);
  }

  const whereSql = where.length ? `AND ${where.join(" AND ")}` : "";

  console.log(`\n🔎 ${table} (cardmarket)`);
  console.log(`   mode: column-style`);
  console.log(
    `   filter: ${
      allDates ? (since ? `ALL dates since ${since}` : "ALL dates") : `date=${asOfDate}`
    }`,
  );

  const priceCols = [
    "average_sell_price",
    "low_price",
    "trend_price",
    "german_pro_low",
    "suggested_price",
    "reverse_holo_sell",
    "reverse_holo_low",
    "reverse_holo_trend",
    "low_price_ex_plus",
    "avg1",
    "avg7",
    "avg30",
    "reverse_holo_avg1",
    "reverse_holo_avg7",
    "reverse_holo_avg30",
  ];

  const unions = priceCols
    .map((col) => {
      const pt = priceTypeFromCardmarketCol(col);
      const cond = conditionFromCardmarketCol(col);
      return `
        SELECT
          mi.id AS market_item_id,
          'cardmarket'::text AS source,
          ${dateExpr} AS as_of_date,
          'USD'::text AS currency,
          '${pt}'::text AS price_type,
          ${cond ? `'${cond}'::text` : "NULL::text"} AS condition,
          h.${quoteIdent(col)} AS raw_value,
          '${col}'::text AS raw_col
        FROM public.${qTable} h
        JOIN public.market_items mi
          ON mi.game='pokemon'
         AND mi.canonical_source='tcgdex'
         AND mi.canonical_id = h.card_id::text
        WHERE h.card_id IS NOT NULL
          AND (h.source_updated_at IS NOT NULL OR h.captured_at IS NOT NULL)
          AND h.${quoteIdent(col)} IS NOT NULL
          ${whereSql}
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
      condition,
      (NULLIF(regexp_replace(raw_value::text, '[^0-9.\\-]', '', 'g'), '')::numeric * 100)::integer AS value_cents,
      jsonb_build_object('table','${table}','column',raw_col,'raw_value',raw_value)
    FROM rows
    WHERE NULLIF(regexp_replace(raw_value::text, '[^0-9.\\-]', '', 'g'), '') IS NOT NULL
    ON CONFLICT DO NOTHING
  `;

  const res = await client.query(sql, params);
  console.log(`✅ inserted ${res.rowCount} snapshot rows from ${table}`);
  return res.rowCount || 0;
}

async function main() {
  const args = parseArgs(process.argv);
  const DATABASE_URL = mustEnv("DATABASE_URL");

  const opts = {
    allDates: !!args["all-dates"],
    date: args.date ? String(args.date) : null,
    since: args.since ? String(args.since) : null,
  };

  if (!opts.allDates && !opts.date) opts.date = todayYmd();

  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    console.log("📥 Normalizing Pokémon HISTORY vendor prices into market_price_snapshots…");

    let total = 0;
    total += await normalizeTcgplayerHistory(client, opts);
    total += await normalizeCardmarketHistory(client, opts);

    console.log(`\n✅ Done. Inserted ${total} total snapshot rows.`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("❌ Error:", e?.stack || e?.message || e);
  process.exit(1);
});
