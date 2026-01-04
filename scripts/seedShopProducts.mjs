#!/usr/bin/env node
/**
 * scripts/seedShopProducts.mjs
 *
 * Seeds a distributor-friendly spread of products into:
 *   public.products
 *   public.product_images
 *   public.tags
 *   public.product_tags
 *
 * Safe to re-run: UPSERT by products.slug (unique).
 *
 * Usage:
 *   node scripts/seedShopProducts.mjs
 *   node scripts/seedShopProducts.mjs --dry-run
 *
 * Env:
 *   DATABASE_URL (required)
 */

import "dotenv/config";
import pg from "pg";

const { Client } = pg;

const DRY_RUN = process.argv.includes("--dry-run");
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL in environment.");
  process.exit(1);
}

function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cents(n) {
  return Math.round(Number(n) * 100);
}

// Use a placeholder image now; swap later with Cloudflare Images.
const PLACEHOLDER_IMG =
  "https://placehold.co/800x1100/png?text=Legendary+Collectibles";
const PLACEHOLDER_ALT = "Legendary Collectibles product image";

// Tags we’ll ensure exist (distributor-friendly + matches your UI filters)
const TAGS = [
  { slug: "hot-deals", name: "Hot Deals" },
  { slug: "new", name: "New Arrivals" },
  { slug: "featured", name: "Featured" },
  { slug: "sealed", name: "Sealed" },
  { slug: "graded", name: "Graded" },
  { slug: "accessory", name: "Accessories" },
];

// IMPORTANT: ENUM values must match your DB enums.
// Your API allows: games pokemon/yugioh/mtg; format single/pack/box/bundle/lot/accessory
// grader: psa/bgs/cgc/sgc
// condition: nm/lp/mp/hp/dmg
// status: MUST be whatever your enum supports. Your API filters status="active"
// so your enum must include 'active'. (It already works in your API output.)
function mkProduct({
  game,
  format,
  title,
  subtitle = null,
  description = null,
  price,
  compareAt = null,
  sealed = false,
  isGraded = false,
  grader = null,
  gradeX10 = null,
  condition = "nm",
  quantity = 1,
  status = "active",
  tags = [],
  imageUrl = PLACEHOLDER_IMG,
  imageAlt = null,
}) {
  return {
    title,
    slug: slugify(`${game}-${title}`),
    game,
    format,
    sealed,
    is_graded: isGraded,
    grader,
    grade_x10: gradeX10,
    condition,
    price_cents: cents(price),
    compare_at_cents: compareAt != null ? cents(compareAt) : null,
    inventory_type: "stock",
    quantity: Number(quantity),
    status,
    subtitle,
    description,
    tags,
    image: {
      url: imageUrl,
      alt: imageAlt ?? title ?? PLACEHOLDER_ALT,
      sort: 0,
    },
  };
}

/**
 * Distributor-friendly spread (enough to look real):
 * - Pokémon: singles + graded + sealed pack/ETB/box
 * - Yu-Gi-Oh!: singles (some staples + iconic)
 * - MTG: singles + a couple sealed items
 * - Accessories: a few basics (high-margin, real-retailer signal)
 */
const PRODUCTS = [
  // --------------------------
  // Pokémon — Singles (raw)
  // --------------------------
  mkProduct({
    game: "pokemon",
    format: "single",
    title: "Eevee — Near Mint",
    subtitle: "Starter • NM",
    price: 1.49,
    compareAt: 1.99,
    condition: "nm",
    quantity: 10,
    tags: ["new", "featured"],
  }),
  mkProduct({
    game: "pokemon",
    format: "single",
    title: "Pikachu — Near Mint",
    subtitle: "Iconic • NM",
    price: 2.99,
    condition: "nm",
    quantity: 6,
    tags: ["featured"],
  }),
  mkProduct({
    game: "pokemon",
    format: "single",
    title: "Gengar — Near Mint",
    subtitle: "Fan Favorite • NM",
    price: 12.99,
    condition: "nm",
    quantity: 2,
    tags: ["featured"],
  }),
  mkProduct({
    game: "pokemon",
    format: "single",
    title: "Mewtwo — Near Mint",
    subtitle: "Classic • NM",
    price: 9.99,
    condition: "nm",
    quantity: 2,
    tags: [],
  }),
  mkProduct({
    game: "pokemon",
    format: "single",
    title: "Charizard — Lightly Played",
    subtitle: "Iconic • LP",
    price: 39.99,
    condition: "lp",
    quantity: 1,
    tags: ["hot-deals"],
  }),
  mkProduct({
    game: "pokemon",
    format: "single",
    title: "Umbreon — Near Mint",
    subtitle: "Eevee-lution • NM",
    price: 24.99,
    condition: "nm",
    quantity: 1,
    tags: ["new"],
  }),
  mkProduct({
    game: "pokemon",
    format: "single",
    title: "Dragonite — Near Mint",
    subtitle: "Classic • NM",
    price: 8.99,
    condition: "nm",
    quantity: 2,
    tags: [],
  }),
  mkProduct({
    game: "pokemon",
    format: "single",
    title: "Rayquaza — Lightly Played",
    subtitle: "Chase • LP",
    price: 19.99,
    condition: "lp",
    quantity: 1,
    tags: ["featured"],
  }),

  // --------------------------
  // Pokémon — Graded (PSA)
  // --------------------------
  mkProduct({
    game: "pokemon",
    format: "single",
    title: "Pikachu — PSA 9",
    subtitle: "Graded • PSA 9",
    price: 29.99,
    condition: "nm",
    isGraded: true,
    grader: "psa",
    gradeX10: 90,
    quantity: 1,
    tags: ["graded", "featured"],
  }),
  mkProduct({
    game: "pokemon",
    format: "single",
    title: "Eevee — PSA 10",
    subtitle: "Graded • PSA 10",
    price: 59.99,
    condition: "nm",
    isGraded: true,
    grader: "psa",
    gradeX10: 100,
    quantity: 1,
    tags: ["graded", "hot-deals"],
  }),

  // --------------------------
  // Pokémon — Sealed
  // --------------------------
  mkProduct({
    game: "pokemon",
    format: "pack",
    title: "Pokémon Booster Pack (Sealed)",
    subtitle: "Sealed • Booster Pack",
    price: 4.99,
    sealed: true,
    condition: "nm",
    quantity: 12,
    tags: ["sealed", "new"],
  }),
  mkProduct({
    game: "pokemon",
    format: "bundle",
    title: "Elite Trainer Box (Sealed)",
    subtitle: "Sealed • ETB",
    price: 49.99,
    sealed: true,
    condition: "nm",
    quantity: 3,
    tags: ["sealed", "featured"],
  }),
  mkProduct({
    game: "pokemon",
    format: "box",
    title: "Booster Box (Sealed)",
    subtitle: "Sealed • Booster Box",
    price: 129.99,
    sealed: true,
    condition: "nm",
    quantity: 2,
    tags: ["sealed"],
  }),

  // --------------------------
  // Yu-Gi-Oh! — Singles
  // --------------------------
  ...[
    ["Blue-Eyes White Dragon — Near Mint", 7.99, "nm", "Classic • Blue-Eyes", ["featured"]],
    ["Dark Magician — Near Mint", 6.99, "nm", "Classic • Dark Magician", []],
    ["Red-Eyes Black Dragon — Lightly Played", 4.99, "lp", "Classic • Red-Eyes", []],
    ["Ash Blossom & Joyous Spring — Near Mint", 3.99, "nm", "Staple • Hand Trap", ["new"]],
    ["Infinite Impermanence — Near Mint", 5.49, "nm", "Staple • Trap", []],
    ["Monster Reborn — Near Mint", 1.99, "nm", "Classic • Spell", ["hot-deals"]],
    ["Raigeki — Near Mint", 2.49, "nm", "Classic • Spell", []],
    ["Accesscode Talker — Near Mint", 14.99, "nm", "Chase • Link Monster", ["featured"]],
  ].map(([title, price, condition, subtitle, tags]) =>
    mkProduct({
      game: "yugioh",
      format: "single",
      title,
      subtitle,
      price,
      condition,
      quantity: String(title).includes("Accesscode") ? 1 : 3,
      tags,
    })
  ),

  // --------------------------
  // MTG — Singles
  // --------------------------
  ...[
    ["Sol Ring — Near Mint", 2.99, "nm", "Commander • Staple", ["featured"]],
    ["Rhystic Study — Near Mint", 29.99, "nm", "Commander • Chase", ["featured"]],
    ["Cyclonic Rift — Near Mint", 19.99, "nm", "Commander • Staple", []],
    ["Thoughtseize — Near Mint", 12.99, "nm", "Staple • Disruption", ["new"]],
    ["Lightning Bolt — Near Mint", 1.49, "nm", "Staple • Burn", ["hot-deals"]],
    ["Counterspell — Near Mint", 1.99, "nm", "Staple • Control", []],
  ].map(([title, price, condition, subtitle, tags]) =>
    mkProduct({
      game: "mtg",
      format: "single",
      title,
      subtitle,
      price,
      condition,
      quantity: String(title).includes("Rhystic") ? 1 : 5,
      tags,
    })
  ),

  // MTG — Sealed (to avoid “singles-only” look)
  mkProduct({
    game: "mtg",
    format: "pack",
    title: "MTG Draft Booster Pack (Sealed)",
    subtitle: "Sealed • Draft Booster",
    price: 4.49,
    sealed: true,
    condition: "nm",
    quantity: 12,
    tags: ["sealed"],
  }),
  mkProduct({
    game: "mtg",
    format: "bundle",
    title: "MTG Bundle (Sealed)",
    subtitle: "Sealed • Bundle",
    price: 44.99,
    sealed: true,
    condition: "nm",
    quantity: 2,
    tags: ["sealed", "featured"],
  }),

  // --------------------------
  // Accessories (game enum might NOT allow "other")
  // If your game enum doesn't include "other", change these to "pokemon" or "mtg"
  // and keep format="accessory". We'll validate quickly by running the script.
  // --------------------------
  mkProduct({
    game: "pokemon",
    format: "accessory",
    title: "Penny Sleeves (100ct)",
    subtitle: "Accessories • Sleeves",
    price: 1.99,
    condition: "nm",
    quantity: 25,
    tags: ["accessory"],
  }),
  mkProduct({
    game: "pokemon",
    format: "accessory",
    title: "Toploaders (25ct)",
    subtitle: "Accessories • Toploaders",
    price: 4.99,
    condition: "nm",
    quantity: 15,
    tags: ["accessory", "new"],
  }),
  mkProduct({
    game: "pokemon",
    format: "accessory",
    title: "Deck Box (Standard Size)",
    subtitle: "Accessories • Deck Box",
    price: 7.99,
    condition: "nm",
    quantity: 8,
    tags: ["accessory"],
  }),
];

// ---- SQL helpers ----
async function ensureTags(client) {
  for (const t of TAGS) {
    const existing = await client.query(
      `SELECT id FROM public.tags WHERE slug=$1 LIMIT 1`,
      [t.slug]
    );
    if (existing.rowCount) continue;

    if (!DRY_RUN) {
      await client.query(
        `INSERT INTO public.tags (slug, name, created_at)
         VALUES ($1, $2, now())
         ON CONFLICT (slug) DO NOTHING`,
        [t.slug, t.name]
      );
    }
  }

  const all = await client.query(`SELECT id, slug FROM public.tags`);
  const map = new Map();
  for (const r of all.rows) map.set(r.slug, r.id);
  return map;
}

async function upsertProduct(client, p) {
  const res = await client.query(
    `
    INSERT INTO public.products
      (title, slug, game, format, sealed, is_graded, grader, grade_x10, condition,
       price_cents, compare_at_cents, inventory_type, quantity, status, subtitle, description,
       created_at, updated_at)
    VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, now(), now())
    ON CONFLICT (slug) DO UPDATE SET
      title=EXCLUDED.title,
      game=EXCLUDED.game,
      format=EXCLUDED.format,
      sealed=EXCLUDED.sealed,
      is_graded=EXCLUDED.is_graded,
      grader=EXCLUDED.grader,
      grade_x10=EXCLUDED.grade_x10,
      condition=EXCLUDED.condition,
      price_cents=EXCLUDED.price_cents,
      compare_at_cents=EXCLUDED.compare_at_cents,
      inventory_type=EXCLUDED.inventory_type,
      quantity=EXCLUDED.quantity,
      status=EXCLUDED.status,
      subtitle=EXCLUDED.subtitle,
      description=EXCLUDED.description,
      updated_at=now()
    RETURNING id
    `,
    [
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
    ]
  );

  return res.rows[0].id;
}

async function upsertPrimaryImage(client, productId, img) {
  if (DRY_RUN) return;

  await client.query(`DELETE FROM public.product_images WHERE product_id=$1`, [
    productId,
  ]);

  await client.query(
    `INSERT INTO public.product_images (product_id, url, alt, sort, created_at)
     VALUES ($1,$2,$3,0,now())`,
    [productId, img.url, img.alt || null]
  );
}

async function setProductTags(client, productId, tagIds) {
  if (DRY_RUN) return;

  await client.query(`DELETE FROM public.product_tags WHERE product_id=$1`, [
    productId,
  ]);

  for (const tagId of tagIds) {
    await client.query(
      `INSERT INTO public.product_tags (product_id, tag_id, created_at)
       VALUES ($1,$2,now())
       ON CONFLICT (product_id, tag_id) DO NOTHING`,
      [productId, tagId]
    );
  }
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    console.log(`=== Seed SHOP Products (${DRY_RUN ? "DRY RUN" : "LIVE"}) ===`);
    console.log(`Products: ${PRODUCTS.length}`);

    await client.query("BEGIN");

    const tagMap = await ensureTags(client);

    let i = 0;
    for (const p of PRODUCTS) {
      if (DRY_RUN) {
        i++;
        continue;
      }

      const productId = await upsertProduct(client, p);

      await upsertPrimaryImage(client, productId, p.image);

      const tagIds = (p.tags || [])
        .map((slug) => tagMap.get(slug))
        .filter(Boolean);

      await setProductTags(client, productId, tagIds);

      i++;
      if (i % 10 === 0) console.log(`... seeded ${i}/${PRODUCTS.length}`);
    }

    if (DRY_RUN) {
      await client.query("ROLLBACK");
      console.log("DRY RUN complete (rolled back).");
    } else {
      await client.query("COMMIT");
      console.log("✅ Seed complete.");
    }

    console.log("Test:");
    console.log("  /api/shop/products?game=pokemon&format=single&limit=24");
    console.log("  /api/shop/products?game=pokemon&format=pack&sealed=true&limit=24");
    console.log("  /api/shop/products?game=yugioh&format=single&limit=24");
    console.log("  /api/shop/products?game=mtg&format=single&limit=24");
    console.log("  /api/shop/products?game=pokemon&format=accessory&limit=24");
    console.log("  /api/shop/products?game=pokemon&format=single&tag=hot-deals");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
