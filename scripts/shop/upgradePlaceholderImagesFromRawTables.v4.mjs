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

// "Charizard — Lightly Played" -> "Charizard"
function baseNameFromProductTitle(title) {
  const t = norm(title);

  // split on em dash first
  const left = t.split("—")[0].trim();

  // fallback: "Name - PSA 10"
  const left2 = left.split(" - ")[0].trim();

  return left2
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const client = await pool.connect();
  try {
    console.log("=== upgradePlaceholderImagesFromRawTables.v4: start ===");

    const { rows } = await client.query(`
      SELECT
        pi.id            AS image_id,
        pi.product_id,
        pi.url           AS current_url,
        p.title          AS product_title,
        p.game,
        p.format
      FROM product_images pi
      JOIN products p ON p.id = pi.product_id
      WHERE pi.sort = 0
        AND pi.url ~* '^https://placehold\\.co/'
      ORDER BY p.game, p.format, p.title
    `);

    console.log("placeholder image rows:", rows.length);

    let updated = 0;
    let noMatch = 0;

    for (const r of rows) {
      const title = norm(r.product_title);
      const game = norm(r.game);
      const format = norm(r.format);
      const baseName = baseNameFromProductTitle(title);

      let newUrl = null;

      // -----------------------------
      // MTG singles -> scryfall_cards_raw.payload.image_uris
      // -----------------------------
      if (game === "mtg" && format === "single") {
        const mtg = await client.query(
          `
          SELECT
            COALESCE(
              payload->'image_uris'->>'normal',
              payload->'image_uris'->>'large',
              payload->'image_uris'->>'small'
            ) AS url
          FROM scryfall_cards_raw
          WHERE LOWER(payload->>'name') = LOWER($1)
          ORDER BY (payload->>'released_at') DESC NULLS LAST
          LIMIT 1
          `,
          [baseName],
        );
        newUrl = mtg.rows[0]?.url ?? null;
      }

      // -----------------------------
      // YGO singles -> ygo_cards + ygo_card_images
      // Adjust these names if your schema differs.
      // -----------------------------
      if (!newUrl && game === "yugioh" && format === "single") {
        const ygo = await client.query(
          `
          SELECT i.image_url AS url
          FROM ygo_cards c
          JOIN ygo_card_images i ON i.cardid = c.id
          WHERE LOWER(c.name) = LOWER($1)
          ORDER BY i."index" ASC NULLS LAST
          LIMIT 1
          `,
          [baseName],
        );
        newUrl = ygo.rows[0]?.url ?? null;
      }

      // -----------------------------
      // POKEMON singles -> tcg_cards + tcg_card_images
      //
      // Assumes:
      //   tcg_cards.id is the same as tcg_card_images.card_id (e.g. "base1-4")
      //   tcg_cards.name is the card name ("Charizard")
      //   tcg_cards."set.id" -> tcg_sets.id (optional, for ordering by releaseDate)
      // -----------------------------
      if (!newUrl && game === "pokemon" && format === "single") {
        const pkm = await client.query(
          `
          SELECT
            COALESCE(img.large, img.small) AS url
          FROM tcg_cards c
          JOIN tcg_card_images img
            ON img.card_id = c.id
          LEFT JOIN tcg_sets s
            ON s.id = c."set.id"
          WHERE LOWER(c.name) = LOWER($1)
          ORDER BY s.release_date DESC NULLS LAST, c.id ASC
          LIMIT 1
          `,
          [baseName],
        ).catch(async () => {
          // If your tcg_sets columns differ, fallback: just pick any match
          const fallback = await client.query(
            `
            SELECT
              COALESCE(img.large, img.small) AS url
            FROM tcg_cards c
            JOIN tcg_card_images img
              ON img.card_id = c.id
            WHERE LOWER(c.name) = LOWER($1)
            ORDER BY c.id ASC
            LIMIT 1
            `,
            [baseName],
          );
          return fallback;
        });

        newUrl = pkm.rows[0]?.url ?? null;
      }

      // Do not auto-map sealed/accessory here (curate those separately)
      if (!newUrl) {
        console.log(`🟡 no match: ${game}/${format} ${title} (base="${baseName}")`);
        noMatch++;
        continue;
      }

      if (!/^https?:\/\//i.test(newUrl)) {
        console.log(`🟡 bad url (skipped): ${game}/${format} ${title} -> ${newUrl}`);
        noMatch++;
        continue;
      }

      if (!PLACEHOLDER_RE.test(r.current_url)) {
        // Shouldn't happen due to WHERE clause, but safe.
        continue;
      }

      await client.query(
        `UPDATE product_images SET url = $1 WHERE id = $2`,
        [newUrl, r.image_id],
      );

      console.log(`🟢 updated: ${title} -> ${newUrl}`);
      updated++;
    }

    console.log("=== done ===");
    console.log({ updated, noMatch, total: rows.length });
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
