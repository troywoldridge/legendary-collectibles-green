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

async function tableExists(client, name) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1 LIMIT 1`,
    [name]
  );
  return rows.length > 0;
}

async function columnExists(client, table, col) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1 AND column_name=$2
     LIMIT 1`,
    [table, col]
  );
  return rows.length > 0;
}

function defaultImageFor(game, format) {
  // You control these via env so we don't guess wrong art.
  // Examples you can set:
  // SHOP_DEFAULT_MTG_PACK_IMAGE=https://.../mtg-pack.jpg
  // SHOP_DEFAULT_YUGIOH_SEALED_IMAGE=https://.../ygo-sealed.jpg
  const g = norm(game).toLowerCase();
  const f = norm(format).toLowerCase();

  const key =
    `SHOP_DEFAULT_${g.toUpperCase()}_${f.toUpperCase()}_IMAGE`.replace(/[^A-Z0-9_]/g, "_");

  const genericKey =
    `SHOP_DEFAULT_${g.toUpperCase()}_IMAGE`.replace(/[^A-Z0-9_]/g, "_");

  return process.env[key] || process.env[genericKey] || "";
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
    WHERE (payload->>'name' ILIKE $1) OR (name ILIKE $1)
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
  return url || null;
}

async function resolveYgoFromDb(client, title) {
  const name = baseTitle(title);
  if (!name) return null;

  // Strategy A: ygo_card_images has a direct name column
  if (await tableExists(client, "ygo_card_images")) {
    const hasCardName = await columnExists(client, "ygo_card_images", "card_name");
    const hasName = await columnExists(client, "ygo_card_images", "name");
    const hasImageUrl = await columnExists(client, "ygo_card_images", "image_url");

    if (hasImageUrl && (hasCardName || hasName)) {
      const col = hasCardName ? "card_name" : "name";
      const { rows } = await client.query(
        `SELECT image_url AS url FROM ygo_card_images WHERE ${col} ILIKE $1 ORDER BY ${col} LIMIT 1`,
        [`%${name}%`]
      );
      const url = rows?.[0]?.url ? norm(rows[0].url) : "";
      if (url) return url;
    }
  }

  // Strategy B: ygo_card_images has card_id, and there is a ygo_cards table we can join to by name
  const hasYgoCards = await tableExists(client, "ygo_cards");
  const hasYgoCardsRaw = await tableExists(client, "ygo_cards_raw");
  const hasYgoImages = await tableExists(client, "ygo_card_images");

  if (hasYgoImages && await columnExists(client, "ygo_card_images", "card_id")) {
    // Join ygo_cards(card_id -> id) if possible
    if (hasYgoCards && (await columnExists(client, "ygo_cards", "id")) && (await columnExists(client, "ygo_cards", "name"))) {
      const { rows } = await client.query(
        `
        SELECT i.image_url AS url
        FROM ygo_card_images i
        JOIN ygo_cards c ON c.id = i.card_id
        WHERE c.name ILIKE $1
        LIMIT 1
        `,
        [`%${name}%`]
      );
      const url = rows?.[0]?.url ? norm(rows[0].url) : "";
      if (url) return url;
    }

    // Some schemas store payload JSON in ygo_cards_raw
    if (hasYgoCardsRaw) {
      const hasPayload = await columnExists(client, "ygo_cards_raw", "payload");
      if (hasPayload) {
        const { rows } = await client.query(
          `
          SELECT i.image_url AS url
          FROM ygo_card_images i
          JOIN ygo_cards_raw r ON (r.payload->>'id')::text = i.card_id::text
          WHERE (r.payload->>'name') ILIKE $1
          LIMIT 1
          `,
          [`%${name}%`]
        );
        const url = rows?.[0]?.url ? norm(rows[0].url) : "";
        if (url) return url;
      }
    }
  }

  return null;
}

async function main() {
  const client = await pool.connect();
  try {
    console.log("=== upgradePlaceholderImagesFromRawTables.v2: start ===");

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

      let url = null;

      // Cards (non-sealed singles): pull real art
      if (!sealed && format === "single") {
        if (game === "mtg") url = await resolveMtgFromDb(client, r.title);
        if (game === "yugioh") url = await resolveYgoFromDb(client, r.title);
      }

      // Sealed/bundles/packs/accessories: set a default per game+format (env controlled)
      if (!url) {
        const fallback = defaultImageFor(game, format);
        if (fallback) url = fallback;
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
