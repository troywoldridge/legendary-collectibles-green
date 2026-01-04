import type { ShopApiQuery } from "@/lib/shop/client";

export type DepartmentKey = "pokemon" | "yugioh" | "mtg" | "sports" | "accessories";

export type CategorySlug =
  | "all"
  | "singles"
  | "graded"
  | "packs"
  | "boxes"
  | "bundles"
  | "lots"
  | "accessories";

export type CategoryConfig = {
  slug: CategorySlug;
  name: string;
  description: string;
  badge?: string;
};

export type DepartmentConfig = {
  key: DepartmentKey;
  name: string;
  description: string;
  hero: {
    eyebrow: string;
    title: string;
    blurb: string;
    accent?: string;
  };
  categories: CategoryConfig[];
};

const CATEGORY_ALIASES: Record<CategorySlug, string[]> = {
  all: ["all", "everything"],
  singles: ["single", "singles"],
  graded: ["graded", "slab", "slabs"],
  packs: ["pack", "packs", "blister", "blisters"],
  boxes: ["box", "boxes"],
  bundles: ["bundle", "bundles", "etb", "etbs", "collection", "collections"],
  lots: ["lot", "lots"],
  accessories: ["accessory", "accessories", "supply", "supplies"],
};

export const DEPARTMENTS: Record<DepartmentKey, DepartmentConfig> = {
  pokemon: {
    key: "pokemon",
    name: "Pokémon",
    description: "Singles, slabs, sealed, and trainer accessories.",
    hero: {
      eyebrow: "Pokémon Center-grade",
      title: "Catch grails, slabs, and sealed heat",
      blurb: "Shop vintage holos, modern alt-arts, Japanese exclusives, and sealed boosters ready to rip.",
      accent: "Pikachu-approved inventory with transparent grading notes.",
    },
    categories: [
      { slug: "all", name: "All Pokémon", description: "Every Pokémon item in one feed" },
      { slug: "singles", name: "Singles", description: "Raw Pokémon singles" },
      { slug: "graded", name: "Graded", description: "PSA / BGS / CGC slabs" },
      { slug: "packs", name: "Booster Packs", description: "Sealed booster and promo packs" },
      { slug: "boxes", name: "Booster Boxes", description: "Sealed booster boxes & displays" },
      { slug: "bundles", name: "Bundles & ETBs", description: "Elite Trainer Boxes, tins, and bundles" },
      { slug: "accessories", name: "Accessories", description: "Sleeves, binders, storage" },
    ],
  },

  yugioh: {
    key: "yugioh",
    name: "Yu-Gi-Oh!",
    description: "Chase cards, slabs, and sealed product.",
    hero: {
      eyebrow: "Duel-ready",
      title: "Yu-Gi-Oh! vault for duelists",
      blurb: "From Ghost Rares to tournament staples, browse graded slabs and sealed sets without guesswork.",
      accent: "Verified inventory with condition notes on every listing.",
    },
    categories: [
      { slug: "all", name: "All Yu-Gi-Oh!", description: "Full feed across YGO" },
      { slug: "singles", name: "Singles", description: "Raw Yu-Gi-Oh! singles" },
      { slug: "graded", name: "Graded", description: "PSA / BGS / CGC slabs" },
      { slug: "packs", name: "Packs", description: "Booster and blister packs" },
      { slug: "boxes", name: "Boxes", description: "Sealed boxes and cases" },
      { slug: "bundles", name: "Structure / Bundles", description: "Structure decks and collector bundles" },
      { slug: "accessories", name: "Accessories", description: "Deck boxes, sleeves, binders" },
    ],
  },

  mtg: {
    key: "mtg",
    name: "Magic: The Gathering",
    description: "Singles, Commander staples, sealed sets, and graded cards.",
    hero: {
      eyebrow: "Commander tuned",
      title: "MTG singles, staples, and sealed experiences",
      blurb: "Crack collector boosters, pick up Reserve List singles, or snag graded heavy-hitters.",
      accent: "Curated for EDH, Modern, and collectors alike.",
    },
    categories: [
      { slug: "all", name: "All MTG", description: "Every Magic listing" },
      { slug: "singles", name: "Singles", description: "Raw MTG singles" },
      { slug: "graded", name: "Graded", description: "Slabbed MTG singles" },
      { slug: "packs", name: "Booster Packs", description: "Set / Draft / Collector packs" },
      { slug: "boxes", name: "Booster Boxes", description: "Sealed boxes & cases" },
      { slug: "bundles", name: "Bundles", description: "Bundles, decks, and collections" },
      { slug: "accessories", name: "Accessories", description: "Sleeves, playmats, deck boxes" },
    ],
  },

  sports: {
    key: "sports",
    name: "Sports Cards",
    description: "Singles, lots, graded slabs, and sealed wax.",
    hero: {
      eyebrow: "Hobby shop energy",
      title: "Wax, slabs, and singles for every sport",
      blurb: "Rip wax, hunt rookies, or add graded grails across baseball, basketball, football, and more.",
      accent: "Live-stocked inventory with transparent conditions.",
    },
    categories: [
      { slug: "all", name: "All Sports", description: "Everything in one feed" },
      { slug: "singles", name: "Singles", description: "Raw singles by sport" },
      { slug: "graded", name: "Graded", description: "PSA / BGS / SGC slabs" },
      { slug: "packs", name: "Packs", description: "Retail & hobby packs" },
      { slug: "boxes", name: "Boxes", description: "Wax boxes & cases" },
      { slug: "bundles", name: "Lots & Bundles", description: "Player lots, mystery stacks, bundles" },
      { slug: "accessories", name: "Supplies", description: "Toploaders, sleeves, binders" },
    ],
  },

  accessories: {
    key: "accessories",
    name: "Accessories",
    description: "Sleeves, binders, storage, grading supplies, and display pieces.",
    hero: {
      eyebrow: "Collect with care",
      title: "Premium supplies for every collection",
      blurb: "Pro-level sleeves, display cases, binders, and storage that keep cards pristine.",
      accent: "Cross-compatible accessories for Pokémon, YGO, MTG, and sports.",
    },
    categories: [
      { slug: "all", name: "All Accessories", description: "Everything to protect and display" },
      { slug: "accessories", name: "Supplies", description: "Sleeves, loaders, binders, storage" },
    ],
  },
};

export function normalizeDepartmentSlug(raw: string | null | undefined): DepartmentKey | null {
  const slug = (raw ?? "").trim().toLowerCase();
  if (!slug) return null;
  return slug === "yugi" ? "yugioh" : ((slug as DepartmentKey) in DEPARTMENTS ? (slug as DepartmentKey) : null);
}

export function normalizeCategorySlug(raw: string | null | undefined): CategorySlug | null {
  const slug = (raw ?? "").trim().toLowerCase();
  if (!slug) return null;

  for (const [canonical, aliases] of Object.entries(CATEGORY_ALIASES) as [CategorySlug, string[]][]) {
    if (aliases.includes(slug)) return canonical;
  }

  return null;
}

export function getDepartmentConfig(key: DepartmentKey | null | undefined): DepartmentConfig | null {
  if (!key) return null;
  return DEPARTMENTS[key] ?? null;
}

export function getCategoryConfig(
  dept: DepartmentKey,
  category: CategorySlug | null | undefined
): CategoryConfig | null {
  if (!category) return null;
  const cfg = DEPARTMENTS[dept]?.categories.find((c) => c.slug === category);
  return cfg ?? null;
}

export function categoryToApi(dept: DepartmentKey, category: CategorySlug): { label: string; api: ShopApiQuery } | null {
  switch (category) {
    case "all":
      return {
        label: `${DEPARTMENTS[dept].name} — All`,
        api: dept === "accessories" ? { format: "accessory" } : { game: dept },
      };

    case "singles":
      return { label: "Singles", api: { game: dept, format: "single" } };

    case "graded":
      return { label: "Graded Singles", api: { game: dept, format: "single", graded: true } };

    case "packs":
      return { label: "Packs", api: { game: dept, format: "pack", sealed: true } };

    case "boxes":
      return { label: "Boxes", api: { game: dept, format: "box", sealed: true } };

    case "bundles":
      return { label: "Bundles", api: { game: dept, format: "bundle", sealed: true } };

    case "lots":
      return { label: "Lots", api: { game: dept, format: "lot" } };

    case "accessories":
      return {
        label: "Accessories",
        api: dept === "accessories" ? { format: "accessory" } : { game: dept, format: "accessory" },
      };

    default:
      return null;
  }
}

