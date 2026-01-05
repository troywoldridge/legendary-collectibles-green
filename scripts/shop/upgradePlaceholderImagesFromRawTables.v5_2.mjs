#!/usr/bin/env node
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

const PLACEHOLDER_RE = /^https:\/\/placehold\.co\//i;

function norm(s) {
  return String(s ?? "").trim();
}

function normName(s) {
  return norm(s)
    .replace(/\s+/g, " ")
    .replace(/[’]/g, "'")
    .trim();
}

function stripSuffixes(title) {
  // "Charizard — Lightly Played" -> "Charizard"
  // "Eevee — PSA 10" -> "Eevee"
  const t = normName(title);
  return t.split("—")[0].split(" - ")[0].trim();
}

async function main() {
  const client = await pool.connect();
  try {
    console.log("=== upgradePlaceholderImagesFromRawTables.v5_2: start ===");

    // Grab placeholder product images, ordered with sort=0 first.
    // We'll only update the first placeholder image per product.
    const { rows } = await client.query(`
      SELECT
        pi.id          AS image_id,
        pi.product_id  AS product_id,
        pi.url         AS url,
        pi.sort        AS sort,
        pi.created_at  AS created_at,
        p.title        AS title,
        p.game         AS game,
        p.format       AS format
      FROM product_images pi
      JOIN products p ON p.id = pi.product_id
      WHERE pi.url ~* '^https://placehold\\.co/'
      ORDER BY
        p.game, p.format, p.title,
        pi.product_id,
        pi.sort ASC,
        pi.created_at ASC,
        pi.id ASC
    `);

    console.log(`placeholder image rows: ${rows.length}`);

    // Only update one placeholder image per product (usually sort=0)
    const seenProduct = new Set();

    let updated = 0;
    let skipped = 0;
    let noMatch = 0;

    async function updateImage(imageId, newUrl) {
      await client.query(
        `UPDATE product_images SET url = $1 WHERE id = $2`,
        [newUrl, imageId],
      );
    }

    for (const r of rows) {
      const productId = String(r.product_id);
      if (seenProduct.has(productId)) {
        skipped++;
        continue;
      }

      const game = norm(r.game).toLowerCase();
      const format = norm(r.format).toLowerCase();
      const title = norm(r.title);

      // We only auto-resolve images for singles/cards.
      const isSingle =
        format === "single" || format === "singles" || format === "card";

      if (!isSingle) {
        // leave sealed/accessories placeholders alone for now
        seenProduct.add(productId);
        skipped++;
        console.log(`⏭️  skipped (non-single): ${game}/${format} ${title}`);
        continue;
      }

      const baseName = stripSuffixes(title);
      let newUrl = null;

      // =========================
      // POKEMON (PokemonTCG)
      // =========================
      if (game === "pokemon") {
        const { rows: poke } = await client.query(
          `
          SELECT i.large
          FROM tcg_cards c
          JOIN tcg_card_images i ON i.card_id = c.id
          WHERE lower(c.name) = lower($1)
          LIMIT 1
        `,
          [baseName],
        );

        if (poke.length) newUrl = poke[0].large || null;
      }

      // =========================
      // MTG (Scryfall raw JSON)
      // =========================
      if (game === "mtg") {
        const { rows: mtg } = await client.query(
          `
          SELECT
            COALESCE(
              payload->'image_uris'->>'normal',
              payload->'image_uris'->>'large',
              payload->'image_uris'->>'png'
            ) AS url
          FROM scryfall_cards_raw
          WHERE lower(payload->>'name') = lower($1)
          ORDER BY (payload->>'released_at') DESC NULLS LAST
          LIMIT 1
        `,
          [baseName],
        );

        if (mtg.length) newUrl = mtg[0].url || null;
      }

      // =========================
      // YUGIOH (YGOProDeck tables)
      // =========================
      if (game === "yugioh") {
        const { rows: ygo } = await client.query(
          `
          SELECT
            COALESCE(i.image_url_small, i.image_url) AS url
          FROM ygo_cards c
          JOIN ygo_card_images i ON i.card_id = c.card_id
          WHERE lower(c.name) = lower($1)
          ORDER BY
            (i.image_url_small IS NOT NULL) DESC,
            i.image_url ASC
          LIMIT 1
        `,
          [baseName],
        );

        if (ygo.length) newUrl = ygo[0].url || null;
      }

      if (!newUrl || PLACEHOLDER_RE.test(newUrl)) {
        noMatch++;
        seenProduct.add(productId);
        console.log(`🟡 no match: ${game}/${format} ${title} (base="${baseName}")`);
        continue;
      }

      await updateImage(r.image_id, newUrl);
      updated++;
      seenProduct.add(productId);
      console.log(`🟢 updated: ${title} -> ${newUrl}`);
    }

    console.log("=== done ===");
    console.log({ updated, skipped, noMatch });
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
