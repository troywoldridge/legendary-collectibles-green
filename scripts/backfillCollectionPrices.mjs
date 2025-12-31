#!/usr/bin/env node
import "dotenv/config";
import pg from "pg";

const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}

const client = new Client({ connectionString: DATABASE_URL });

function toNumber(x) {
  if (x == null) return null;
  if (typeof x === "number") return Number.isFinite(x) ? x : null;
  if (typeof x === "string") {
    const s = x.replace(/,/g, "").replace(/[^\d.\-]/g, "");
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toCents(x) {
  const n = toNumber(x);
  if (!n || n <= 0) return null;
  return Math.round(n * 100);
}

function pickPokemonPrice(row, variant) {
  let wide = null;

  if (variant === "normal") wide = row.normal;
  if (variant === "holofoil") wide = row.holofoil;
  if (variant === "reverse_holofoil") wide = row.reverse_holofoil;
  if (variant === "first_edition")
    wide = row.first_edition_holofoil ?? row.first_edition_normal;

  const wideCents = toCents(wide);
  if (wideCents != null) return wideCents;

  return (
    toCents(row.market_price) ??
    toCents(row.mid_price) ??
    toCents(row.low_price) ??
    toCents(row.high_price)
  );
}

async function run() {
  await client.connect();

  const itemsRes = await client.query(`
    SELECT
      id,
      user_id,
      game,
      card_id,
      variant_type,
      quantity
    FROM user_collection_items
    WHERE last_value_cents IS NULL
       OR last_value_cents = 0
  `);

  console.log(`Found ${itemsRes.rows.length} items to backfill`);

  for (const item of itemsRes.rows) {
    let unitCents = null;

    if (item.game === "pokemon") {
      const priceRes = await client.query(
        `
        SELECT *
        FROM tcg_card_prices_tcgplayer
        WHERE card_id = $1
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 1
        `,
        [item.card_id],
      );

      const row = priceRes.rows[0];
      if (row) {
        unitCents = pickPokemonPrice(row, item.variant_type);
      }
    }

    if (!unitCents) continue;

    const totalCents = unitCents * item.quantity;

    await client.query(
      `
      UPDATE user_collection_items
      SET last_value_cents = $1,
          updated_at = NOW()
      WHERE id = $2
      `,
      [totalCents, item.id],
    );

    await client.query(
      `
      INSERT INTO user_collection_item_valuations (
        user_id,
        item_id,
        as_of_date,
        game,
        value_cents,
        currency,
        source,
        confidence,
        meta
      )
      VALUES (
        $1, $2, CURRENT_DATE, $3, $4, 'USD',
        'tcgplayer_db', 'backfill',
        jsonb_build_object(
          'unit_price_cents', $5,
          'quantity', $6,
          'card_id', $7,
          'variant_type', $8
        )
      )
      ON CONFLICT (user_id, item_id, as_of_date, COALESCE(source, ''))
      DO UPDATE SET
        value_cents = EXCLUDED.value_cents,
        updated_at = NOW()
      `,
      [
        item.user_id,
        item.id,
        item.game,
        totalCents,
        unitCents,
        item.quantity,
        item.card_id,
        item.variant_type,
      ],
    );

    console.log(
      `✔ ${item.card_id} (${item.variant_type}) → $${(totalCents / 100).toFixed(2)}`,
    );
  }

  await client.end();
  console.log("Backfill complete.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
