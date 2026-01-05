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
  // "Dark Magician — Near Mint" => "Dark Magician"
  // Handles em dash, hyphen, etc.
  const t = normName(title);
  return t
    .split("—")[0]
    .split(" - ")[0]
    .trim();
}

async function main() {
  const client = await pool.connect();
  try {
    console.log("=== upgradePlaceholderImagesFromRawTables.v5: start ===");

    // Pull all product_images that still have placeholder URLs
    const { rows } = await client.query(`
      SELECT
        pi.id          AS image_id,
        pi.product_id  AS product_id,
        pi.url         AS url,
        p.title        AS title,
        p.game         AS game,
        p.format       AS format
      FROM product_images pi
      JOIN products p ON p.id = pi.product_id
      WHERE pi.url ~* '^https://placehold\\.co/'
      ORDER BY p.game, p.format, p.title, pi.position
    `);

    console.log(`placeholder image rows: ${rows.length}`);

    let updated = 0;
    let skipped = 0;
    let noMatch = 0;

    // Small helper: update one image row
    async function updateImage(imageId, newUrl) {
      await client.query(
        `UPDATE product_images SET url = $1 WHERE id = $2`,
        [newUrl, imageId],
      );
    }

    for (const r of rows) {
      const game = norm(r.game).toLowerCase();
      const format = norm(r.format).toLowerCase();
      const title = norm(r.title);

      // Only attempt card-like formats; skip sealed/accessory for now
      const isSingle =
        format === "single" || format === "singles" || format === "card";

      if (!isSingle) {
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
        // Your tcg_card_images table uses card_id values like "base1-4"
        // We do NOT have card_id on products, so we match by name via tcg_cards.
        // We pick the best match by exact name match.
        const { rows: poke } = await client.query(
          `
          SELECT i.large
          FROM tcg_cards c
          JOIN tcg_card_images i ON i.card_id = c.id
          WHERE lower(c.name) = lower($1)
          ORDER BY i.source DESC
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
        // ygo_cards: card_id text PK, name text
        // ygo_card_images: card_id + image_url
        // We match by name, then pick a deterministic image.
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
        console.log(`🟡 no match: ${game}/${format} ${title} (base="${baseName}")`);
        continue;
      }

      try {
        await updateImage(r.image_id, newUrl);
        updated++;
        console.log(`🟢 updated: ${title} -> ${newUrl}`);
      } catch (e) {
        console.error(`🔴 update failed (${r.image_id}): ${e.message}`);
      }
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
