#!/usr/bin/env node
/* eslint-disable no-console */
import "dotenv/config";
import pg from "pg";

const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL || "";
if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const k = a.slice(2);
    const v = argv[i + 1];
    if (!v || v.startsWith("--")) args[k] = true;
    else {
      args[k] = v;
      i++;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const days = Number(args.days || 180);

  if (!Number.isFinite(days) || days <= 0) {
    console.error("Invalid --days");
    process.exit(1);
  }

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    console.log(`=== seed market_sales_comps (pokemon) from vendor history: days=${days} ===`);

    // TCGplayer history → treat "market" as a pricing snapshot comp (Ungraded only for v1).
    const insTcg = await client.query(
      `
      INSERT INTO public.market_sales_comps
        (game, card_key, grade, source, title, sold_price_usd, sold_at, url)
      SELECT
        'pokemon' AS game,
        ('pokemon|card|' || h.card_id) AS card_key,
        'Ungraded' AS grade,
        'tcgplayer_market' AS source,
        NULL::text AS title,
        h.normal::numeric(12,2) AS sold_price_usd,
        h.source_updated_at AS sold_at,
        NULL::text AS url
      FROM public.tcg_card_prices_tcgplayer_history h
      WHERE h.source_updated_at >= now() - ($1::int || ' days')::interval
        AND h.normal IS NOT NULL
      ON CONFLICT DO NOTHING
      `,
      [days]
    );

    console.log("inserted tcgplayer comps:", insTcg.rowCount || 0);

    // Cardmarket history as secondary
    const insCm = await client.query(
      `
      INSERT INTO public.market_sales_comps
        (game, card_key, grade, source, title, sold_price_usd, sold_at, url)
      SELECT
        'pokemon' AS game,
        ('pokemon|card|' || h.card_id) AS card_key,
        'Ungraded' AS grade,
        'cardmarket_market' AS source,
        NULL::text AS title,
        COALESCE(h.trend_price, h.average_sell_price, h.low_price)::numeric(12,2) AS sold_price_usd,
        h.source_updated_at AS sold_at,
        NULL::text AS url
      FROM public.tcg_card_prices_cardmarket_history h
      WHERE h.source_updated_at >= now() - ($1::int || ' days')::interval
        AND COALESCE(h.trend_price, h.average_sell_price, h.low_price) IS NOT NULL
      ON CONFLICT DO NOTHING
      `,
      [days]
    );

    console.log("inserted cardmarket comps:", insCm.rowCount || 0);

    console.log("=== done ===");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e?.stack || e?.message || String(e));
  process.exit(1);
});
