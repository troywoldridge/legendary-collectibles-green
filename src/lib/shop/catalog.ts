// src/lib/shop/catalog.ts
import "server-only";

/**
 * This module powers /shop routing + department landing pages.
 *
 * IMPORTANT SEPARATION:
 * - /shop/*  = for-sale inventory browsing
 * - /categories/* = catalog / collection browsing
 *
 * "collectibles" in SHOP is a computed bucket (everything NOT pokemon/yugioh/mtg/funko).
 * It should never link to /categories/collectibles/items from the shop UI.
 */

export type ShopDepartmentSlug =
  | "pokemon"
  | "yugioh"
  | "mtg"
  | "funko"
  | "sports"
  | "collectibles";

export type DepartmentHero = {
  eyebrow: string;
  title: string;
  blurb: string;
  accent?: string | null;
};

export type DepartmentCategory = {
  slug: string; // goes into /shop/[department]/[category]
  name: string;
  description: string;
  badge?: string | null;
};

export type DepartmentConfig = {
  slug: ShopDepartmentSlug;
  name: string;
  description: string; // used for SEO metadata
  hero: DepartmentHero;
  categories: DepartmentCategory[];
};

/** Normalize aliases and casing for /shop/[department] */
export function normalizeDepartmentSlug(raw: string): ShopDepartmentSlug | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;

  // aliases
  if (s === "ygo" || s === "yu-gi-oh" || s === "yu-gi-oh!") return "yugioh";
  if (s === "magic") return "mtg";

  // treat figures/figure/collectible as the SHOP bucket "collectibles"
  if (s === "figures" || s === "figure") return "collectibles";
  if (s === "collectible") return "collectibles";

  if (
    s === "pokemon" ||
    s === "yugioh" ||
    s === "mtg" ||
    s === "funko" ||
    s === "sports" ||
    s === "collectibles"
  ) {
    return s;
  }

  return null;
}

/**
 * Department definitions used by /shop/[department]/page.tsx
 * Each category slug maps to /shop/:department/:category, where :category is typically:
 * - all, single, pack, box, bundle, lot, accessory
 *
 * NOTE: "collectibles" uses the same category slugs, but the API route treats it as a special bucket.
 */
const DEPARTMENTS: Record<ShopDepartmentSlug, DepartmentConfig> = {
  pokemon: {
    slug: "pokemon",
    name: "Pokémon",
    description: "Shop Pokémon singles, sealed products, and accessories currently for sale.",
    hero: {
      eyebrow: "Shop",
      title: "Pokémon",
      blurb: "Browse Pokémon listings currently for sale — singles, sealed, and more.",
      accent: "Tip: Singles default-sort by set + number for easier browsing.",
    },
    categories: [
      { slug: "all", name: "All", description: "All Pokémon listings currently for sale.", badge: "Browse" },
      { slug: "single", name: "Singles", description: "Individual Pokémon cards for sale." },
      { slug: "pack", name: "Packs", description: "Booster packs and sealed pack products." },
      { slug: "box", name: "Boxes", description: "Booster boxes and sealed boxes." },
      { slug: "bundle", name: "Bundles", description: "Bundles, lots, and multi-item sealed products." },
      { slug: "accessory", name: "Accessories", description: "Supplies and accessories (sleeves, binders, etc.)." },
    ],
  },

  yugioh: {
    slug: "yugioh",
    name: "Yu-Gi-Oh!",
    description: "Shop Yu-Gi-Oh! singles, sealed products, and accessories currently for sale.",
    hero: {
      eyebrow: "Shop",
      title: "Yu-Gi-Oh!",
      blurb: "Browse Yu-Gi-Oh! listings currently for sale — singles, sealed, and more.",
      accent: null,
    },
    categories: [
      { slug: "all", name: "All", description: "All Yu-Gi-Oh! listings currently for sale.", badge: "Browse" },
      { slug: "single", name: "Singles", description: "Individual Yu-Gi-Oh! cards for sale." },
      { slug: "pack", name: "Packs", description: "Booster packs and sealed pack products." },
      { slug: "box", name: "Boxes", description: "Booster boxes and sealed boxes." },
      { slug: "bundle", name: "Bundles", description: "Bundles, lots, and multi-item sealed products." },
      { slug: "accessory", name: "Accessories", description: "Supplies and accessories." },
    ],
  },

  mtg: {
    slug: "mtg",
    name: "Magic: The Gathering",
    description: "Shop Magic: The Gathering singles, sealed products, and accessories currently for sale.",
    hero: {
      eyebrow: "Shop",
      title: "Magic: The Gathering",
      blurb: "Browse MTG listings currently for sale — singles, sealed, and more.",
      accent: null,
    },
    categories: [
      { slug: "all", name: "All", description: "All MTG listings currently for sale.", badge: "Browse" },
      { slug: "single", name: "Singles", description: "Individual MTG cards for sale." },
      { slug: "pack", name: "Packs", description: "Booster packs and sealed pack products." },
      { slug: "box", name: "Boxes", description: "Booster boxes and sealed boxes." },
      { slug: "bundle", name: "Bundles", description: "Bundles, lots, and multi-item sealed products." },
      { slug: "accessory", name: "Accessories", description: "Supplies and accessories." },
    ],
  },

  funko: {
    slug: "funko",
    name: "Funko",
    description: "Shop Funko Pops and Funko collectibles currently for sale.",
    hero: {
      eyebrow: "Shop",
      title: "Funko",
      blurb: "Browse Funko Pops and Funko collectibles currently for sale.",
      accent: "Catalog lives under /categories/funko/items — shop inventory lives here.",
    },
    categories: [
      { slug: "all", name: "All", description: "All Funko listings currently for sale.", badge: "Browse" },
      { slug: "single", name: "Singles", description: "Individual Funko items for sale." },
      { slug: "bundle", name: "Bundles", description: "Lots and multi-item Funko listings." },
      { slug: "accessory", name: "Accessories", description: "Protectors and related accessories." },
    ],
  },

  collectibles: {
    slug: "collectibles",
    name: "Figures & Collectibles",
    description:
      "Shop figures & collectibles currently for sale that are not Pokémon, Yu-Gi-Oh!, Magic: The Gathering, or Funko.",
    hero: {
      eyebrow: "Shop",
      title: "Figures & Collectibles",
      blurb: "Everything for sale that isn’t Pokémon, Yu-Gi-Oh!, MTG, or Funko.",
      accent: "This is a computed shop bucket — it auto-excludes the big four categories.",
    },
    categories: [
      { slug: "all", name: "All", description: "All figures & collectibles for sale.", badge: "Browse" },
      { slug: "single", name: "Singles", description: "Single-item figures & collectibles listings." },
      { slug: "bundle", name: "Bundles", description: "Lots and multi-item collectibles listings." },
      { slug: "accessory", name: "Accessories", description: "Accessories that are not in the main TCG departments." },
    ],
  },

  sports: {
    slug: "sports",
    name: "Sports",
    description: "Shop sports cards and sports collectibles currently for sale.",
    hero: {
      eyebrow: "Shop",
      title: "Sports",
      blurb: "Browse sports cards and sports collectibles currently for sale.",
      accent: null,
    },
    categories: [
      { slug: "all", name: "All", description: "All sports listings currently for sale.", badge: "Browse" },
      { slug: "single", name: "Singles", description: "Individual sports cards and items for sale." },
      { slug: "bundle", name: "Bundles", description: "Lots and multi-item sports listings." },
      { slug: "accessory", name: "Accessories", description: "Sports-related accessories." },
    ],
  },
};

export function getDepartmentConfig(slug: ShopDepartmentSlug): DepartmentConfig {
  return DEPARTMENTS[slug];
}
