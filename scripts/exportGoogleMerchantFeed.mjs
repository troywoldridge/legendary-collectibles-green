// scripts/exportGoogleMerchantFeed.mjs
// Usage:
//   node scripts/exportGoogleMerchantFeed.mjs
// Optional env overrides:
//   SITE_URL="https://legendary-collectibles.com" FEED_OUT="./google-feed.csv" node scripts/exportGoogleMerchantFeed.mjs

import "dotenv/config";
import pg from "pg";
import fs from "node:fs";
import path from "node:path";

const { Pool } = pg;

const SITE_URL =
  (process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://legendary-collectibles.com"
  ).replace(/\/+$/, "");

const OUT_PATH = process.env.FEED_OUT || "./google-merchant-feed.csv";

// EXACT headers you asked for (keep as-is)
const HEADERS = [
  "id",
  "title",
  "description",
  "availability",
  "availability date",
  "expiration date",
  "link",
  "mobile link",
  "image link",
  "price",
  "sale price",
  "sale price effective date",
  "identifier exists",
  "gtin",
  "mpn",
  "brand",
  "product highlight",
  "product detail",
  "additional image link",
  "condition",
  "adult",
  "color",
  "size",
  "size type",
  "size system",
  "gender",
  "material",
  "pattern",
  "age group",
  "multipack",
  "is bundle",
  "unit pricing measure",
  "unit pricing base measure",
  "energy efficiency class",
  "min energy efficiency class",
  "min energy efficiency class",
  "item group id",
  "sell on google quantity",
];

function moneyUSDFromCents(cents) {
  const v = Number(cents ?? 0) / 100;
  return `${v.toFixed(2)} USD`;
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildProductLink(slug) {
  // adjust if your route differs
  return `${SITE_URL}/products/${slug}`;
}

function mapGoogleCondition(_conditionText) {
  // Most collectible shops keep this "new" and put NM/LP inside title/description.
  return "new";
}

function mapAvailability(status, qty) {
  const q = Number(qty ?? 0);
  const s = String(status ?? "").toLowerCase();
  if (s !== "active") return "out_of_stock";
  return q > 0 ? "in_stock" : "out_of_stock";
}

function sellOnGoogleQty(status, qty) {
  const s = String(status ?? "").toLowerCase();
  if (s !== "active") return 0;
  const q = Number(qty ?? 0);
  return q > 0 ? q : 0;
}

function highlightFromRow(r) {
  if (r.is_graded) {
    const g = (r.grader || "").toUpperCase();
    const grade = r.grade_x10 ? (Number(r.grade_x10) / 10).toFixed(1) : "";
    return `${g ? g + " " : ""}${grade ? "Grade " + grade : "Graded"} collectible`;
  }
  if (r.sealed) return "Factory sealed product";
  if (String(r.format || "").toLowerCase() === "accessory") return "Collector accessory";
  return "Collector-quality single";
}

function detailFromRow(r) {
  return r.subtitle || "";
}

// --- MTG: parse Scryfall payload json for an image URL ---
function safeJsonParse(maybeJson) {
  if (!maybeJson) return null;
  if (typeof maybeJson === "object") return maybeJson;
  const s = String(maybeJson);
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function extractScryfallImage(payload) {
  const p = safeJsonParse(payload);
  if (!p) return null;

  // typical: payload.image_uris.{large,normal,small}
  const iu = p.image_uris;
  if (iu?.large) return iu.large;
  if (iu?.normal) return iu.normal;
  if (iu?.small) return iu.small;

  // double-faced cards: payload.card_faces[].image_uris
  const faces = Array.isArray(p.card_faces) ? p.card_faces : [];
  for (const f of faces) {
    const fiu = f?.image_uris;
    if (fiu?.large) return fiu.large;
    if (fiu?.normal) return fiu.normal;
    if (fiu?.small) return fiu.small;
  }

  return null;
}

// --- Find what FK column your products table uses for cards ---
async function detectCardIdColumn(client) {
  const { rows } = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='products'
  `);

  const cols = new Set(rows.map((r) => r.column_name));

  // common possibilities (we’ll pick the first that exists)
  const candidates = [
    "card_id",
    "tcg_card_id",
    "pokemon_card_id",
    "ygo_card_id",
    "mtg_card_id",
    "scryfall_id",
    "scryfall_card_id",
  ];

  for (const c of candidates) {
    if (cols.has(c)) return c;
  }

  return null;
}

function placeholderImageFor(r) {
  // You can replace these with real category images later.
  const game = String(r.game || "").toLowerCase();
  if (game === "pokemon") return `${SITE_URL}/images/placeholder-pokemon.jpg`;
  if (game === "yugioh") return `${SITE_URL}/images/placeholder-yugioh.jpg`;
  if (game === "mtg") return `${SITE_URL}/images/placeholder-mtg.jpg`;
  return `${SITE_URL}/images/placeholder.jpg`;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("Missing DATABASE_URL in environment.");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
  });

  const client = await pool.connect();

  try {
    const cardIdCol = await detectCardIdColumn(client);
    console.log("Detected products card id column:", cardIdCol || "(none)");

    // Build SQL that only tries joins if we have some card id column.
    // If you later add products.feed_image_url, it will automatically be used if present.
    const { rows: prodCols } = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema='public'
        AND table_name='products'
        AND column_name IN ('feed_image_url')
    `);
    const hasFeedImageUrl = prodCols.some((r) => r.column_name === "feed_image_url");

    const selectFeedImage = hasFeedImageUrl ? "p.feed_image_url AS feed_image_url," : "NULL::text AS feed_image_url,";

    const joinPokemon =
      cardIdCol
        ? `LEFT JOIN tcg_cards tcg ON (p.game='pokemon' AND tcg.id = p.${cardIdCol})`
        : `LEFT JOIN tcg_cards tcg ON false`;

    const joinYgo =
      cardIdCol
        ? `LEFT JOIN ygo_card_images ygoi ON (p.game='yugioh' AND ygoi.card_id = p.${cardIdCol})`
        : `LEFT JOIN ygo_card_images ygoi ON false`;

    const joinMtg =
      cardIdCol
        ? `LEFT JOIN scryfall_cards_raw scr ON (p.game='mtg' AND scr.id = p.${cardIdCol})`
        : `LEFT JOIN scryfall_cards_raw scr ON false`;

    const sql = `
      SELECT
        p.id,
        p.title,
        p.slug,
        p.game,
        p.format,
        p.sealed,
        p.is_graded,
        p.grader,
        p.grade_x10,
        p.condition,
        p.price_cents,
        p.compare_at_cents,
        p.inventory_type,
        p.quantity,
        p.status,
        p.subtitle,
        p.description,
        ${selectFeedImage}
        tcg.small_image AS pokemon_small_image,
        tcg.large_image AS pokemon_large_image,
        ygoi.image_url AS ygo_image_url,
        scr.payload AS scryfall_payload
      FROM products p
      ${joinPokemon}
      ${joinYgo}
      ${joinMtg}
      ORDER BY p.created_at ASC NULLS LAST, p.title ASC
    `;

    const { rows } = await client.query(sql);

    const lines = [];
    lines.push(HEADERS.map(csvEscape).join(","));

    for (const r of rows) {
      const availability = mapAvailability(r.status, r.quantity);
      const qtyForGoogle = sellOnGoogleQty(r.status, r.quantity);

      // price / sale price
      const pc = Number(r.price_cents ?? 0);
      const compare =
        r.compare_at_cents === null || r.compare_at_cents === undefined || r.compare_at_cents === ""
          ? null
          : Number(r.compare_at_cents);

      let priceOut = moneyUSDFromCents(pc);
      let salePriceOut = "";

      if (compare && compare > pc) {
        priceOut = moneyUSDFromCents(compare);   // regular
        salePriceOut = moneyUSDFromCents(pc);    // discounted
      }

      // --- image selection ---
      // Priority:
      // 1) products.feed_image_url (if exists + populated)
      // 2) pokemon large_image then small_image
      // 3) ygo image_url
      // 4) scryfall payload-derived url
      // 5) placeholder
      let imageLink =
        (r.feed_image_url && String(r.feed_image_url).trim()) ||
        (r.pokemon_large_image && String(r.pokemon_large_image).trim()) ||
        (r.pokemon_small_image && String(r.pokemon_small_image).trim()) ||
        (r.ygo_image_url && String(r.ygo_image_url).trim()) ||
        extractScryfallImage(r.scryfall_payload) ||
        placeholderImageFor(r);

      const link = buildProductLink(r.slug);
      const mobileLink = link;

      const row = {
        "id": r.id,
        "title": r.title,
        "description": r.description || "",
        "availability": availability,
        "availability date": "",
        "expiration date": "",
        "link": link,
        "mobile link": mobileLink,
        "image link": imageLink,
        "price": priceOut,
        "sale price": salePriceOut,
        "sale price effective date": "",
        "identifier exists": "false",
        "gtin": "",
        "mpn": "",
        "brand": "Legendary Collectibles",
        "product highlight": highlightFromRow(r),
        "product detail": detailFromRow(r),
        "additional image link": "",
        "condition": mapGoogleCondition(r.condition),
        "adult": "",
        "color": "",
        "size": "",
        "size type": "",
        "size system": "",
        "gender": "",
        "material": "",
        "pattern": "",
        "age group": "",
        "multipack": "",
        "is bundle": r.format === "bundle" || r.sealed ? "true" : "false",
        "unit pricing measure": "",
        "unit pricing base measure": "",
        "energy efficiency class": "",
        "min energy efficiency class": "",
        "item group id": "",
        "sell on google quantity": String(qtyForGoogle),
      };

      lines.push(HEADERS.map((h) => csvEscape(row[h] ?? "")).join(","));
    }

    const outAbs = path.resolve(OUT_PATH);
    fs.writeFileSync(outAbs, lines.join("\n"), "utf-8");

    console.log(`✅ Exported ${rows.length} products`);
    console.log(`✅ CSV written to: ${outAbs}`);
    console.log(`SITE_URL: ${SITE_URL}`);
    if (!cardIdCol) {
      console.log("⚠️ No products card-id column detected. Pokémon/YGO/MTG joins will be skipped until you add one.");
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Export failed:", err);
  process.exit(1);
});
