#!/usr/bin/env node
import "dotenv/config";
import pg from "pg";

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();

  console.log("Rebuilding Pokémon variants from tcgplayer prices…");

  const res = await client.query(`
  SELECT
    card_id,

    MAX(CASE WHEN normal IS NOT NULL AND btrim(normal) <> '' THEN 1 ELSE 0 END) = 1
      AS has_normal,

    MAX(CASE WHEN holofoil IS NOT NULL AND btrim(holofoil) <> '' THEN 1 ELSE 0 END) = 1
      AS has_holo,

    MAX(CASE WHEN reverse_holofoil IS NOT NULL AND btrim(reverse_holofoil) <> '' THEN 1 ELSE 0 END) = 1
      AS has_reverse,

    MAX(
      CASE
        WHEN first_edition_holofoil IS NOT NULL
          OR first_edition_normal IS NOT NULL
        THEN 1 ELSE 0
      END
    ) = 1 AS has_first_edition

  FROM tcg_card_prices_tcgplayer
  GROUP BY card_id
`);


  let count = 0;

  for (const r of res.rows) {
    await client.query(
      `
      INSERT INTO tcg_card_variants (
        card_id,
        normal,
        holo,
        reverse,
        first_edition,
        w_promo
      )
      VALUES ($1, $2, $3, $4, $5, false)
      ON CONFLICT (card_id)
      DO UPDATE SET
        normal = EXCLUDED.normal,
        holo = EXCLUDED.holo,
        reverse = EXCLUDED.reverse,
        first_edition = EXCLUDED.first_edition
      `,
      [
        r.card_id,
        r.has_normal,
        r.has_holo,
        r.has_reverse,
        r.has_first_edition,
      ],
    );

    count++;
  }

  console.log(`✔ Updated variants for ${count} cards`);
  await client.end();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
