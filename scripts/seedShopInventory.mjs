#!/usr/bin/env node
/**
 * scripts/seedShopInventory.mjs
 *
 * Seeds a distributor-friendly spread of shop inventory into:
 *   public.inventory_items
 *   public.inventory_item_images (if present / compatible)
 *
 * Safe to re-run: upserts by unique sku.
 *
 * Usage:
 *   node scripts/seedShopInventory.mjs
 *   node scripts/seedShopInventory.mjs --dry-run
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

function nowIso() {
  return new Date().toISOString();
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
  // accept numbers like 3.99
  return Math.round(Number(n) * 100);
}

// A single clean placeholder image is fine for “store legitimacy”
// until you attach real photos/CF Images.
const PLACEHOLDER_IMG = "https://placehold.co/800x1100/png?text=Legendary+Collectibles";
const PLACEHOLDER_ALT = "Legendary Collectibles product image";

function baseMeta({
  format,
  sealed = false,
  isGraded = false,
  grader = null,
  gradeX10 = null,
  subtitle = null,
  tags = [],
}) {
  return {
    format,               // your API filters by format
    sealed: !!sealed,     // your API supports sealed=true
    isGraded: !!isGraded, // your API supports graded=true
    grader: grader || null,
    gradeX10: gradeX10 ?? null, // e.g. 90 for PSA 9.0, 100 for PSA 10
    subtitle: subtitle || null,
    tags: Array.isArray(tags) ? tags : [],
    // optional, useful for display
    seededAt: nowIso(),
  };
}

/**
 * Distributor-friendly spread:
 * - Pokémon Singles (12)
 * - Pokémon Graded (4)
 * - Pokémon Sealed Packs/ETB/Booster Box (4)
 * - Yu-Gi-Oh Singles (10)
 * - MTG Singles (10)
 * - Accessories (6)
 *
 * Total: 46 items (enough to look real, not overwhelming)
 */
const ITEMS = [
  // ----------------------------
  // POKÉMON — Singles (raw)
  // ----------------------------
  {
    sku: "LC-PKMN-S-0001",
    game: "pokemon",
    title: "Pikachu (Promo) — Near Mint",
    condition: "nm",
    status: "active",
    on_hand: 6,
    price_cents: cents(2.99),
    cost_basis_cents: cents(1.00),
    meta: baseMeta({ format: "single", subtitle: "Promo • Pikachu", tags: ["new", "starter"] }),
  },
  {
    sku: "LC-PKMN-S-0002",
    game: "pokemon",
    title: "Charizard — Moderately Played",
    condition: "mp",
    status: "active",
    on_hand: 1,
    price_cents: cents(39.99),
    cost_basis_cents: cents(25.00),
    meta: baseMeta({ format: "single", subtitle: "Iconic • Charizard", tags: ["hot-deals"] }),
  },
  {
    sku: "LC-PKMN-S-0003",
    game: "pokemon",
    title: "Gengar — Near Mint",
    condition: "nm",
    status: "active",
    on_hand: 2,
    price_cents: cents(12.99),
    cost_basis_cents: cents(7.00),
    meta: baseMeta({ format: "single", subtitle: "Fan Favorite • Gengar" }),
  },
  {
    sku: "LC-PKMN-S-0004",
    game: "pokemon",
    title: "Mewtwo — Near Mint",
    condition: "nm",
    status: "active",
    on_hand: 2,
    price_cents: cents(9.99),
    cost_basis_cents: cents(5.00),
    meta: baseMeta({ format: "single", subtitle: "Classic • Mewtwo" }),
  },
  {
    sku: "LC-PKMN-S-0005",
    game: "pokemon",
    title: "Eevee — Near Mint",
    condition: "nm",
    status: "active",
    on_hand: 10,
    price_cents: cents(1.49),
    cost_basis_cents: cents(0.25),
    meta: baseMeta({ format: "single", subtitle: "Starter • Eevee" }),
  },
  {
    sku: "LC-PKMN-S-0006",
    game: "pokemon",
    title: "Snorlax — Near Mint",
    condition: "nm",
    status: "active",
    on_hand: 3,
    price_cents: cents(4.99),
    cost_basis_cents: cents(1.50),
    meta: baseMeta({ format: "single", subtitle: "Classic • Snorlax" }),
  },
  {
    sku: "LC-PKMN-S-0007",
    game: "pokemon",
    title: "Lucario — Near Mint",
    condition: "nm",
    status: "active",
    on_hand: 4,
    price_cents: cents(3.99),
    cost_basis_cents: cents(1.25),
    meta: baseMeta({ format: "single", subtitle: "Modern • Lucario" }),
  },
  {
    sku: "LC-PKMN-S-0008",
    game: "pokemon",
    title: "Rayquaza — Lightly Played",
    condition: "lp",
    status: "active",
    on_hand: 1,
    price_cents: cents(19.99),
    cost_basis_cents: cents(12.00),
    meta: baseMeta({ format: "single", subtitle: "Chase • Rayquaza" }),
  },
  {
    sku: "LC-PKMN-S-0009",
    game: "pokemon",
    title: "Umbreon — Near Mint",
    condition: "nm",
    status: "active",
    on_hand: 1,
    price_cents: cents(24.99),
    cost_basis_cents: cents(15.00),
    meta: baseMeta({ format: "single", subtitle: "Eevee-lution • Umbreon", tags: ["new"] }),
  },
  {
    sku: "LC-PKMN-S-0010",
    game: "pokemon",
    title: "Dragonite — Near Mint",
    condition: "nm",
    status: "active",
    on_hand: 2,
    price_cents: cents(8.99),
    cost_basis_cents: cents(4.50),
    meta: baseMeta({ format: "single", subtitle: "Classic • Dragonite" }),
  },
  {
    sku: "LC-PKMN-S-0011",
    game: "pokemon",
    title: "Gardevoir — Near Mint",
    condition: "nm",
    status: "active",
    on_hand: 2,
    price_cents: cents(5.49),
    cost_basis_cents: cents(2.00),
    meta: baseMeta({ format: "single", subtitle: "Popular • Gardevoir" }),
  },
  {
    sku: "LC-PKMN-S-0012",
    game: "pokemon",
    title: "Lapras — Near Mint",
    condition: "nm",
    status: "active",
    on_hand: 2,
    price_cents: cents(3.49),
    cost_basis_cents: cents(1.25),
    meta: baseMeta({ format: "single", subtitle: "Classic • Lapras" }),
  },

  // ----------------------------
  // POKÉMON — Graded (PSA)
  // ----------------------------
  {
    sku: "LC-PKMN-G-0001",
    game: "pokemon",
    title: "Pikachu (Promo) — PSA 9",
    condition: "graded",
    status: "active",
    on_hand: 1,
    price_cents: cents(29.99),
    cost_basis_cents: cents(18.00),
    meta: baseMeta({
      format: "single",
      isGraded: true,
      grader: "psa",
      gradeX10: 90,
      subtitle: "Graded • PSA 9",
      tags: ["graded", "psa", "new"],
    }),
  },
  {
    sku: "LC-PKMN-G-0002",
    game: "pokemon",
    title: "Charizard — PSA 8",
    condition: "graded",
    status: "active",
    on_hand: 1,
    price_cents: cents(149.99),
    cost_basis_cents: cents(110.00),
    meta: baseMeta({
      format: "single",
      isGraded: true,
      grader: "psa",
      gradeX10: 80,
      subtitle: "Graded • PSA 8",
      tags: ["graded", "psa"],
    }),
  },
  {
    sku: "LC-PKMN-G-0003",
    game: "pokemon",
    title: "Eevee — PSA 10",
    condition: "graded",
    status: "active",
    on_hand: 1,
    price_cents: cents(59.99),
    cost_basis_cents: cents(35.00),
    meta: baseMeta({
      format: "single",
      isGraded: true,
      grader: "psa",
      gradeX10: 100,
      subtitle: "Graded • PSA 10",
      tags: ["graded", "psa", "hot-deals"],
    }),
  },
  {
    sku: "LC-PKMN-G-0004",
    game: "pokemon",
    title: "Mewtwo — PSA 9",
    condition: "graded",
    status: "active",
    on_hand: 1,
    price_cents: cents(44.99),
    cost_basis_cents: cents(28.00),
    meta: baseMeta({
      format: "single",
      isGraded: true,
      grader: "psa",
      gradeX10: 90,
      subtitle: "Graded • PSA 9",
      tags: ["graded", "psa"],
    }),
  },

  // ----------------------------
  // POKÉMON — Sealed
  // ----------------------------
  {
    sku: "LC-PKMN-PACK-0001",
    game: "pokemon",
    title: "Pokémon Booster Pack (Sealed)",
    condition: "sealed",
    status: "active",
    on_hand: 12,
    price_cents: cents(4.99),
    cost_basis_cents: cents(3.25),
    meta: baseMeta({ format: "pack", sealed: true, subtitle: "Sealed • Booster Pack", tags: ["sealed", "new"] }),
  },
  {
    sku: "LC-PKMN-PACK-0002",
    game: "pokemon",
    title: "Pokémon Sleeved Booster (Sealed)",
    condition: "sealed",
    status: "active",
    on_hand: 8,
    price_cents: cents(5.49),
    cost_basis_cents: cents(3.50),
    meta: baseMeta({ format: "pack", sealed: true, subtitle: "Sealed • Sleeved Booster", tags: ["sealed"] }),
  },
  {
    sku: "LC-PKMN-BUNDLE-0001",
    game: "pokemon",
    title: "Elite Trainer Box (Sealed)",
    condition: "sealed",
    status: "active",
    on_hand: 3,
    price_cents: cents(49.99),
    cost_basis_cents: cents(34.00),
    meta: baseMeta({ format: "bundle", sealed: true, subtitle: "Sealed • ETB", tags: ["sealed"] }),
  },
  {
    sku: "LC-PKMN-BOX-0001",
    game: "pokemon",
    title: "Booster Box (Sealed)",
    condition: "sealed",
    status: "active",
    on_hand: 2,
    price_cents: cents(129.99),
    cost_basis_cents: cents(92.00),
    meta: baseMeta({ format: "box", sealed: true, subtitle: "Sealed • Booster Box", tags: ["sealed"] }),
  },

  // ----------------------------
  // YU-GI-OH! — Singles
  // ----------------------------
  ...[
    ["LC-YGO-S-0001", "Blue-Eyes White Dragon — Near Mint", "nm", 7.99, 4.0, "Classic • Blue-Eyes"],
    ["LC-YGO-S-0002", "Dark Magician — Near Mint", "nm", 6.99, 3.5, "Classic • Dark Magician"],
    ["LC-YGO-S-0003", "Red-Eyes Black Dragon — Lightly Played", "lp", 4.99, 2.5, "Classic • Red-Eyes"],
    ["LC-YGO-S-0004", "Exodia the Forbidden One — Near Mint", "nm", 9.99, 5.0, "Iconic • Exodia"],
    ["LC-YGO-S-0005", "Ash Blossom & Joyous Spring — Near Mint", "nm", 3.99, 1.8, "Staple • Hand Trap"],
    ["LC-YGO-S-0006", "Infinite Impermanence — Near Mint", "nm", 5.49, 2.5, "Staple • Trap"],
    ["LC-YGO-S-0007", "Monster Reborn — Near Mint", "nm", 1.99, 0.5, "Classic • Spell"],
    ["LC-YGO-S-0008", "Raigeki — Near Mint", "nm", 2.49, 0.75, "Classic • Spell"],
    ["LC-YGO-S-0009", "Borreload Dragon — Near Mint", "nm", 3.49, 1.5, "Modern • Extra Deck"],
    ["LC-YGO-S-0010", "Accesscode Talker — Near Mint", "nm", 14.99, 9.0, "Chase • Link Monster"],
  ].map(([sku, title, condition, price, cost, subtitle]) => ({
    sku,
    game: "yugioh",
    title,
    condition,
    status: "active",
    on_hand: sku.endsWith("0010") ? 1 : 3,
    price_cents: cents(price),
    cost_basis_cents: cents(cost),
    meta: baseMeta({ format: "single", subtitle, tags: sku.endsWith("0010") ? ["new"] : [] }),
  })),

  // ----------------------------
  // MTG — Singles
  // ----------------------------
  ...[
    ["LC-MTG-S-0001", "Lightning Bolt — Near Mint", "nm", 1.49, 0.35, "Staple • Burn"],
    ["LC-MTG-S-0002", "Counterspell — Near Mint", "nm", 1.99, 0.5, "Staple • Control"],
    ["LC-MTG-S-0003", "Sol Ring — Near Mint", "nm", 2.99, 1.0, "Commander • Staple"],
    ["LC-MTG-S-0004", "Swords to Plowshares — Near Mint", "nm", 1.49, 0.35, "Staple • Removal"],
    ["LC-MTG-S-0005", "Path to Exile — Near Mint", "nm", 2.49, 0.9, "Staple • Removal"],
    ["LC-MTG-S-0006", "Thoughtseize — Near Mint", "nm", 12.99, 8.0, "Staple • Disruption"],
    ["LC-MTG-S-0007", "Rhystic Study — Near Mint", "nm", 29.99, 20.0, "Commander • Chase"],
    ["LC-MTG-S-0008", "Cyclonic Rift — Near Mint", "nm", 19.99, 13.0, "Commander • Staple"],
    ["LC-MTG-S-0009", "Command Tower — Near Mint", "nm", 0.99, 0.2, "Commander • Land"],
    ["LC-MTG-S-0010", "Cultivate — Near Mint", "nm", 0.79, 0.15, "Commander • Ramp"],
  ].map(([sku, title, condition, price, cost, subtitle]) => ({
    sku,
    game: "mtg",
    title,
    condition,
    status: "active",
    on_hand: sku.endsWith("0007") ? 1 : 5,
    price_cents: cents(price),
    cost_basis_cents: cents(cost),
    meta: baseMeta({ format: "single", subtitle }),
  })),

  // ----------------------------
  // MTG — Sealed (a couple items so it doesn't look “singles only”)
  // ----------------------------
  {
    sku: "LC-MTG-PACK-0001",
    game: "mtg",
    title: "MTG Draft Booster Pack (Sealed)",
    condition: "sealed",
    status: "active",
    on_hand: 12,
    price_cents: cents(4.49),
    cost_basis_cents: cents(3.10),
    meta: baseMeta({ format: "pack", sealed: true, subtitle: "Sealed • Draft Booster", tags: ["sealed"] }),
  },
  {
    sku: "LC-MTG-BUNDLE-0001",
    game: "mtg",
    title: "MTG Bundle / Fat Pack (Sealed)",
    condition: "sealed",
    status: "active",
    on_hand: 2,
    price_cents: cents(44.99),
    cost_basis_cents: cents(31.00),
    meta: baseMeta({ format: "bundle", sealed: true, subtitle: "Sealed • Bundle", tags: ["sealed"] }),
  },

  // ----------------------------
  // Accessories — (high margin + distributor “real store” signal)
  // ----------------------------
  {
    sku: "LC-ACC-0001",
    game: "other",
    title: "Penny Sleeves (100ct)",
    condition: "new",
    status: "active",
    on_hand: 25,
    price_cents: cents(1.99),
    cost_basis_cents: cents(0.75),
    meta: baseMeta({ format: "accessory", subtitle: "Accessories • Sleeves", tags: ["accessory"] }),
  },
  {
    sku: "LC-ACC-0002",
    game: "other",
    title: "Toploaders (25ct)",
    condition: "new",
    status: "active",
    on_hand: 15,
    price_cents: cents(4.99),
    cost_basis_cents: cents(2.25),
    meta: baseMeta({ format: "accessory", subtitle: "Accessories • Toploaders", tags: ["accessory", "new"] }),
  },
  {
    sku: "LC-ACC-0003",
    game: "other",
    title: "Semi-Rigid Card Holders (25ct)",
    condition: "new",
    status: "active",
    on_hand: 10,
    price_cents: cents(6.99),
    cost_basis_cents: cents(3.25),
    meta: baseMeta({ format: "accessory", subtitle: "Accessories • Semi-Rigid", tags: ["accessory"] }),
  },
  {
    sku: "LC-ACC-0004",
    game: "other",
    title: "Deck Box (Standard Size)",
    condition: "new",
    status: "active",
    on_hand: 8,
    price_cents: cents(7.99),
    cost_basis_cents: cents(3.75),
    meta: baseMeta({ format: "accessory", subtitle: "Accessories • Deck Box", tags: ["accessory"] }),
  },
  {
    sku: "LC-ACC-0005",
    game: "other",
    title: "Binder (9-Pocket Pages)",
    condition: "new",
    status: "active",
    on_hand: 5,
    price_cents: cents(19.99),
    cost_basis_cents: cents(10.00),
    meta: baseMeta({ format: "accessory", subtitle: "Accessories • Binder", tags: ["accessory"] }),
  },
  {
    sku: "LC-ACC-0006",
    game: "other",
    title: "Storage Box (800ct)",
    condition: "new",
    status: "active",
    on_hand: 6,
    price_cents: cents(9.99),
    cost_basis_cents: cents(5.00),
    meta: baseMeta({ format: "accessory", subtitle: "Accessories • Storage", tags: ["accessory"] }),
  },
];

// Attach the same placeholder image for now.
// You can replace per-item later.
function imageForItem(item) {
  return {
    url: PLACEHOLDER_IMG,
    alt: item.title || PLACEHOLDER_ALT,
  };
}

async function getTableColumns(client, tableName) {
  const { rows } = await client.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name=$1
    ORDER BY ordinal_position
  `,
    [tableName],
  );
  return rows.map((r) => r.column_name);
}

function hasAll(cols, required) {
  return required.every((c) => cols.includes(c));
}

async function upsertInventoryItem(client, item) {
  const slug = item.meta?.slug || slugify(`${item.game}-${item.title}`);

  const meta = {
    ...(item.meta || {}),
    slug,
  };

  const sql = `
    INSERT INTO public.inventory_items
      (sku, game, title, condition, status, on_hand, price_cents, cost_basis_cents, meta, updated_at)
    VALUES
      ($1,  $2,   $3,    $4,        $5,     $6,     $7,         $8,              $9,  now())
    ON CONFLICT (sku) DO UPDATE SET
      game = EXCLUDED.game,
      title = EXCLUDED.title,
      condition = EXCLUDED.condition,
      status = EXCLUDED.status,
      on_hand = EXCLUDED.on_hand,
      price_cents = EXCLUDED.price_cents,
      cost_basis_cents = EXCLUDED.cost_basis_cents,
      meta = EXCLUDED.meta,
      updated_at = now()
    RETURNING id
  `;

  const params = [
    item.sku ?? null,
    item.game ?? "other",
    item.title ?? "",
    item.condition ?? "",
    item.status ?? "active",
    Number.isFinite(item.on_hand) ? item.on_hand : 0,
    Number.isFinite(item.price_cents) ? item.price_cents : 0,
    Number.isFinite(item.cost_basis_cents) ? item.cost_basis_cents : 0,
    meta,
  ];

  if (DRY_RUN) {
    return { id: "dry-run", slug };
  }

  const { rows } = await client.query(sql, params);
  return { id: rows[0].id, slug };
}

async function upsertPrimaryImage(client, imageCols, itemId, img) {
  // We adapt to your actual schema:
  // common columns: item_id, url, alt, sort, position, created_at, updated_at
  // We'll try a few patterns.

  const url = img?.url || PLACEHOLDER_IMG;
  const alt = img?.alt || PLACEHOLDER_ALT;

  // Pattern A: (item_id, url, alt) with UNIQUE(item_id) or similar
  if (hasAll(imageCols, ["item_id", "url", "alt"])) {
    const hasUpdatedAt = imageCols.includes("updated_at");
    const hasCreatedAt = imageCols.includes("created_at");
    const hasSort = imageCols.includes("sort");
    const hasPosition = imageCols.includes("position");

    // Choose a stable “primary slot”
    const sortVal = 0;

    const cols = ["item_id", "url", "alt"];
    const vals = ["$1", "$2", "$3"];
    const params = [itemId, url, alt];

    if (hasSort) {
      cols.push("sort");
      vals.push(`$${params.length + 1}`);
      params.push(sortVal);
    } else if (hasPosition) {
      cols.push("position");
      vals.push(`$${params.length + 1}`);
      params.push(sortVal);
    }
    if (hasCreatedAt) cols.push("created_at"), vals.push("now()");
    if (hasUpdatedAt) cols.push("updated_at"), vals.push("now()");

    // Try to detect a conflict target:
    // - if there is a unique constraint on (item_id, sort/position), you'd need schema.
    // Without it, do a simple "delete then insert" for item_id to stay safe.
    const sql = `
      DELETE FROM public.inventory_item_images WHERE item_id = $1;
      INSERT INTO public.inventory_item_images (${cols.join(", ")})
      VALUES (${vals.join(", ")});
    `;

    if (DRY_RUN) return;

    await client.query("BEGIN");
    try {
      await client.query(sql, params);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      // If delete+insert fails due to schema mismatch, ignore quietly.
      // We'll still have inventory items seeded.
      console.warn("⚠️ Image insert failed (schema mismatch). Continuing.", e?.message || e);
    }

    return;
  }

  // If schema doesn't match expected, skip images gracefully.
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    console.log(`=== Seed Shop Inventory (${DRY_RUN ? "DRY RUN" : "LIVE"}) ===`);
    console.log("Items:", ITEMS.length);

    // Check if images table exists
    let imageCols = [];
    try {
      imageCols = await getTableColumns(client, "inventory_item_images");
      if (imageCols.length) console.log("inventory_item_images columns:", imageCols.join(", "));
      else console.log("inventory_item_images not found or no columns returned.");
    } catch {
      console.log("inventory_item_images not found (skipping images).");
      imageCols = [];
    }

    let upserted = 0;
    let imagesUpserted = 0;

    for (const item of ITEMS) {
      const img = imageForItem(item);

      const { id, slug } = await upsertInventoryItem(client, item);
      upserted++;

      // Only attempt images if table looks usable
      if (imageCols.length) {
        await upsertPrimaryImage(client, imageCols, id, img);
        imagesUpserted++;
      }

      if (upserted % 10 === 0) {
        console.log(`... upserted ${upserted}/${ITEMS.length}`);
      }
    }

    console.log("✅ Done.");
    console.log(`Upserted inventory_items: ${upserted}`);
    if (imageCols.length) console.log(`Image attempts: ${imagesUpserted} (best-effort)`);
    console.log("Try:");
    console.log("  /api/shop/products?game=pokemon&format=single&limit=24");
    console.log("  /api/shop/products?game=pokemon&format=pack&sealed=true&limit=24");
    console.log("  /api/shop/products?game=yugioh&format=single&limit=24");
    console.log("  /api/shop/products?game=mtg&format=single&limit=24");
    console.log("  /api/shop/products?game=other&format=accessory&limit=24");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
