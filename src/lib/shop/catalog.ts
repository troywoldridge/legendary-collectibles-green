// src/lib/shop/catalog.ts
export type ShopCategory = {
  key: string;       // URL slug
  name: string;
  desc?: string;
};

export type ShopDepartment = {
  key: string;       // URL slug
  name: string;
  desc: string;
  categories: ShopCategory[];
};

export function normSlug(raw: string | undefined | null) {
  const s = String(raw ?? "").trim();
  try {
    return decodeURIComponent(s).trim().toLowerCase();
  } catch {
    return s.trim().toLowerCase();
  }
}

export const SHOP_DEPARTMENTS: ShopDepartment[] = [
  {
    key: "pokemon",
    name: "Pokémon",
    desc: "Singles, graded cards, sealed product, and deals.",
    categories: [
      { key: "singles", name: "Singles", desc: "Raw cards" },
      { key: "graded", name: "Graded", desc: "PSA / BGS / CGC slabs" },
      { key: "packs", name: "Packs", desc: "Sealed booster packs & blisters" },
      { key: "boxes", name: "Booster Boxes", desc: "Sealed booster boxes" },
      { key: "bundles", name: "Bundles", desc: "ETBs, collections, bundles" },
    ],
  },
  {
    key: "yugioh",
    name: "Yu-Gi-Oh!",
    desc: "Singles, graded cards, sealed product, and deals.",
    categories: [
      { key: "singles", name: "Singles", desc: "Raw cards" },
      { key: "graded", name: "Graded", desc: "Slabs & graded collectibles" },
      { key: "packs", name: "Packs", desc: "Sealed booster packs" },
      { key: "boxes", name: "Booster Boxes", desc: "Sealed booster boxes" },
      { key: "bundles", name: "Bundles", desc: "Starter/structure, special sets" },
    ],
  },
  {
    key: "mtg",
    name: "Magic: The Gathering",
    desc: "Singles and sealed product for Commander and beyond.",
    categories: [
      { key: "singles", name: "Singles", desc: "Raw cards" },
      { key: "packs", name: "Packs", desc: "Play/Collector boosters" },
      { key: "boxes", name: "Booster Boxes", desc: "Sealed boxes" },
      { key: "bundles", name: "Bundles", desc: "Bundles and sealed sets" },
    ],
  },
  {
    key: "accessories",
    name: "Accessories",
    desc: "Supplies, binders, sleeves, storage, and more.",
    categories: [
      { key: "all", name: "All Accessories", desc: "Browse everything" },
      { key: "sleeves", name: "Sleeves", desc: "Penny sleeves, matte sleeves, etc." },
      { key: "toploaders", name: "Toploaders", desc: "Toploaders & card protection" },
      { key: "binders", name: "Binders", desc: "Binders and pages" },
      { key: "deck-boxes", name: "Deck Boxes", desc: "Deck boxes & cases" },
      { key: "playmats", name: "Playmats", desc: "Playmats and surfaces" },
      { key: "storage", name: "Storage", desc: "Bulk storage and organization" },
    ],
  },
];

export function getDepartment(raw: string | undefined | null): ShopDepartment | null {
  const key = normSlug(raw);
  return SHOP_DEPARTMENTS.find((d) => d.key === key) ?? null;
}

export function getCategory(dept: ShopDepartment, raw: string | undefined | null): ShopCategory | null {
  const key = normSlug(raw);
  return dept.categories.find((c) => c.key === key) ?? null;
}
