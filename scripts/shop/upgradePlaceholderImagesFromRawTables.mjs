#!/usr/bin/env node
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

function norm(s) {
  return String(s ?? "").trim();
}

function isPlaceholder(url) {
  const u = norm(url);
  return !u || u.includes("placehold.co") || u.includes("placeholder");
}

function baseTitle(title) {
  return norm(title)
    .replace(/\s+—\s+Near Mint$/i, "")
    .replace(/\s+—\s+Lightly Played$/i, "")
    .replace(/\s+—\s+Moderately Played$/i, "")
    .replace(/\s+—\s+Heavily Played$/i, "")
    .replace(/\s+—\s+Damaged$/i, "")
    .replace(/\s+—\s+PSA\s*10$/i, "")
    .replace(/\s+—\s+PSA\s*9$/i, "")
    .replace(/\s*\([^)]+\)\s*$/, "")
    .trim();
}

async function resolveMtgFromDb(client, title) {
  const name = baseTitle(title);
  if (!name) return null;

  const { rows } = await client.query(
    `
    SELECT
      COALESCE(
        payload->'image_uris'->>'normal',
        payload->'image_uris'->>'large',
        payload->'image_uris'->>'png'
      ) AS url
    FROM scryfall_cards_raw
    WHERE
      (payload->>'name' ILIKE $1)
      OR (name ILIKE $1)
    ORDER BY
      CASE
        WHEN (payload->>'name') ILIKE $2 THEN 0
        WHEN name ILIKE $2 THEN 0
        ELSE 1
      END,
      (payload->>'released_at') DESC NULLS LAST
    LIMIT 1
    `,
    [`%${name}%`, name]
  );

  const url = rows?.[0]?.url ? norm(rows[0].url) : "";
  return url ? url : null;
}

async function resolveYgoFromDb(client, title) {
  const name = baseTitle(title);
  if (!name) return null;

  // Try likely columns; if your schema differs, we'll adjust after \d output.
  const { rows } = await client
    .query(
      `
      SELECT image_url AS url
      FROM ygo_card_images
      WHERE
        (card_name ILIKE $1)
        OR (name ILIKE $1)
        OR (card ILIKE $1)
      LIMIT 1
      `,
      [`%${name}%`]
    )
    .catch(() => ({ rows: [] }));

  const url = rows?.[0]?.url ? norm(rows[0].url) : "";
  return url ? url : null;
}

async function main() {
  const client = await pool.connect();
  try {
    console.log("=== upgradePlaceholderImagesFromRawTables: start ===");

    const { rows } = await client.query(`
      SELECT
        i.id        AS image_id,
        i.product_id,
        i.url       AS current_url,
        p.title,
        p.game,
        p.format,
        p.sealed
      FROM product_images i
      JOIN products p ON p.id = i.product_id
      WHERE i.url ILIKE '%placehold.co%'
      ORDER BY p.game, p.format, p.title
    `);

    console.log("placeholder image rows:", rows.length);

    let updated = 0;
    let skipped = 0;
    let noMatch = 0;

    for (const r of rows) {
      if (!isPlaceholder(r.current_url)) {
        skipped++;
        continue;
      }

      const game = norm(r.game).toLowerCase();
      const format = norm(r.format).toLowerCase();
      const sealed = !!r.sealed;

      // Don't try to auto-art sealed product types / accessories here
      if (
        sealed ||
        format === "accessory" ||
        format === "bundle" ||
        format === "box" ||
        format === "pack"
      ) {
        skipped++;
        continue;
      }

      let url = null;

      if (game === "mtg") {
        url = await resolveMtgFromDb(client, r.title);
      } else if (game === "yugioh") {
        url = await resolveYgoFromDb(client, r.title);
      } else {
        skipped++;
        continue;
      }

      if (!url) {
        console.log(`🟡 no match: ${r.game}/${r.format} ${r.title}`);
        noMatch++;
        continue;
      }

      await client.query(`UPDATE product_images SET url = $1 WHERE id = $2`, [
        url,
        r.image_id,
      ]);
      console.log(`🟢 updated: ${r.title} -> ${url}`);
      updated++;
    }

    console.log("=== done ===");
    console.log({ updated, skipped, noMatch });
  } finally {
    client.release();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
