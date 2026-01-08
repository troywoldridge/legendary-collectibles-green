#!/usr/bin/env node
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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

async function run() {
  const args = parseArgs(process.argv);
  const game = String(args.game || "").trim(); // "mtg" or "yugioh"
  if (!game || (game !== "mtg" && game !== "yugioh")) {
    console.error('Usage: node scripts/market/02_seed_market_sales_comps_from_current.mjs --game mtg|yugioh');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    console.log(`=== seed market_sales_comps from market_prices_current: game=${game} ===`);

    // source tags (so you can distinguish this from true sold comps later)
    const source = game === "mtg" ? "mtg_current_market" : "yugioh_current_market";

    // Build card_key based on canonical id in market_items
    // mtg uses scryfall uuid, yugioh uses card_id
    const prefix = game === "mtg" ? "mtg|card|" : "yugioh|card|";

    const res = await client.query(
      `
      INSERT INTO public.market_sales_comps
        (game, card_key, grade, source, title, sold_price_usd, sold_at, url)
      SELECT
        $1::text AS game,
        ($2::text || mi.canonical_id::text) AS card_key,
        'Ungraded' AS grade,
        $3::text AS source,
        NULL::text AS title,
        (mpc.price_cents::numeric / 100.0)::numeric(12,2) AS sold_price_usd,
        (mpc.updated_at)::timestamptz AS sold_at,
        NULL::text AS url
      FROM public.market_prices_current mpc
      JOIN public.market_items mi ON mi.id = mpc.market_item_id
      WHERE mi.game = $1::text
        AND mpc.currency = 'USD'
        AND mpc.price_type = 'market'
        AND mpc.price_cents > 0
      ON CONFLICT DO NOTHING
      `,
      [game, prefix, source]
    );

    console.log("inserted:", res.rowCount || 0);
    console.log("=== done ===");
  } finally {
    client.release();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
