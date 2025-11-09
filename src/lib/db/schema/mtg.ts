// src/db/schema/mtg.ts
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  numeric,
  timestamp,
  date,
  bigserial,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* =========================
   mtg_sets
   ========================= */
export const mtgSets = pgTable(
  "mtg_sets",
  {
    id: uuid("id").primaryKey(),
    code: text("code"),
    tcgplayerId: integer("tcgplayer_id"),
    mtgoCode: text("mtgo_code"),
    name: text("name"),
    setType: text("set_type"),
    releasedAt: date("released_at"),
    cardCount: integer("card_count"),
    parentSetCode: text("parent_set_code"),
    digital: boolean("digital"),
    foilOnly: boolean("foil_only"),
    nonfoilOnly: boolean("nonfoil_only"),
    blockCode: text("block_code"),
    block: text("block"),
    iconSvgUri: text("icon_svg_uri"),
    scryfallUri: text("scryfall_uri"),
    searchUri: text("search_uri"),
    uri: text("uri"),
  },
  (t) => ({
    // unique(code) + supporting btree indexes
    codeKey: uniqueIndex("mtg_sets_code_key").on(t.code),
    idxCode: index("idx_mtg_sets_code").on(t.code),
    idxRelease: index("idx_mtg_sets_release").on(t.releasedAt),
    // TRGM on block/name are created via raw SQL (see bottom)
  })
);

/* =========================
   mtg_cards
   ========================= */
export const mtgCards = pgTable(
  "mtg_cards",
  {
    id: uuid("id").primaryKey(),
    oracleId: uuid("oracle_id"),
    setId: uuid("set_id").references(() => mtgSets.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    setCode: text("set_code"),
    setName: text("set_name"),
    collectorNumber: text("collector_number"),
    lang: text("lang"),
    name: text("name"),
    printedName: text("printed_name"),
    layout: text("layout"),
    releasedAt: date("released_at"),
    highresImage: boolean("highres_image"),
    imageStatus: text("image_status"),
    imageUris: jsonb("image_uris"),
    manaCost: text("mana_cost"),
    cmc: numeric("cmc", { precision: 10, scale: 2 }),
    typeLine: text("type_line"),
    oracleText: text("oracle_text"),
    printedTypeLine: text("printed_type_line"),
    printedText: text("printed_text"),
    power: text("power"),
    toughness: text("toughness"),
    loyalty: text("loyalty"),
    defense: text("defense"),
    colors: jsonb("colors"),
    colorIdentity: jsonb("color_identity"),
    producedMana: jsonb("produced_mana"),
    keywords: jsonb("keywords"),
    games: jsonb("games"),
    legalities: jsonb("legalities"),
    rarity: text("rarity"),
    artist: text("artist"),
    artistIds: jsonb("artist_ids"),
    illustrationId: uuid("illustration_id"),
    borderColor: text("border_color"),
    frame: text("frame"),
    frameEffects: jsonb("frame_effects"),
    securityStamp: text("security_stamp"),
    fullArt: boolean("full_art"),
    textless: boolean("textless"),
    booster: boolean("booster"),
    storySpotlight: boolean("story_spotlight"),
    edhrecRank: integer("edhrec_rank"),
    pennyRank: integer("penny_rank"),
    prices: jsonb("prices"),
    relatedUris: jsonb("related_uris"),
    purchaseUris: jsonb("purchase_uris"),
    arenaId: integer("arena_id"),
    mtgoId: integer("mtgo_id"),
    mtgoFoilId: integer("mtgo_foil_id"),
    multiverseIds: jsonb("multiverse_ids"),
    tcgplayerId: integer("tcgplayer_id"),
    cardmarketId: integer("cardmarket_id"),
    reserved: boolean("reserved"),
    reprint: boolean("reprint"),
    variation: boolean("variation"),
    variationOf: uuid("variation_of"),
    promo: boolean("promo"),
    finishes: jsonb("finishes"),
    securityBits: jsonb("security_bits"),
    printsSearchUri: text("prints_search_uri"),
    rulingsUri: text("rulings_uri"),
    scryfallUri: text("scryfall_uri"),
    uri: text("uri"),
    cardFacesRaw: jsonb("card_faces_raw"),
  },
  (t) => ({
    idxOracle: index("idx_mtg_cards_oracle").on(t.oracleId),
    idxLang: index("idx_mtg_cards_lang").on(t.lang),
    idxName: index("idx_mtg_cards_name").on(t.name),
    idxSetCode: index("idx_mtg_cards_set_code").on(t.setCode),
    idxSetNum: index("idx_mtg_cards_set_num").on(t.setCode, t.collectorNumber),
    idxReleased: index("idx_mtg_cards_released").on(t.releasedAt),
    // GIN/TRGM indexes on colors, name, type_line are created via raw SQL (see bottom)
  })
);

/* =========================
   mtg_card_faces
   ========================= */
export const mtgCardFaces = pgTable(
  "mtg_card_faces",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    cardId: uuid("card_id")
      .notNull()
      .references(() => mtgCards.id, { onDelete: "cascade" }),
    faceIndex: integer("face_index").notNull(),
    name: text("name"),
    printedName: text("printed_name"),
    manaCost: text("mana_cost"),
    typeLine: text("type_line"),
    oracleText: text("oracle_text"),
    colors: jsonb("colors"),
    power: text("power"),
    toughness: text("toughness"),
    loyalty: text("loyalty"),
    defense: text("defense"),
    flavorText: text("flavor_text"),
    flavorName: text("flavor_name"),
    artist: text("artist"),
    illustrationId: uuid("illustration_id"),
    imageUris: jsonb("image_uris"),
  },
  (t) => ({
    idxCard: index("idx_mtg_faces_card").on(t.cardId),
  })
);

/* =========================
   mtg_card_prices
   ========================= */
export const mtgCardPrices = pgTable(
  "mtg_card_prices",
  {
    scryfallId: uuid("scryfall_id").primaryKey(),
    setCode: text("set_code"),
    collectorNo: text("collector_no"),
    usd: numeric("usd", { precision: 12, scale: 2 }),
    usdFoil: numeric("usd_foil", { precision: 12, scale: 2 }),
    usdEtched: numeric("usd_etched", { precision: 12, scale: 2 }),
    eur: numeric("eur", { precision: 12, scale: 2 }),
    eurFoil: numeric("eur_foil", { precision: 12, scale: 2 }),
    tix: numeric("tix", { precision: 12, scale: 2 }),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    idxSetNum: index("mtg_card_prices_setnum_idx").on(t.setCode, t.collectorNo),
  })
);

/* =========================
   mtg_card_rulings
   ========================= */
export const mtgCardRulings = pgTable(
  "mtg_card_rulings",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    oracleId: uuid("oracle_id").notNull(),
    source: text("source"),
    publishedAt: date("published_at"),
    comment: text("comment"),
  },
  (t) => ({
    idxOracle: index("idx_mtg_rulings_oracle").on(t.oracleId),
    // Matches the ON CONFLICT used by your importer
    uqRuling: uniqueIndex("mtg_card_rulings_uq_idx").on(
      t.oracleId,
      t.publishedAt,
      t.source,
      t.comment
    ),
  })
);

/* =========================
   mtg_card_foreign_names
   ========================= */
export const mtgCardForeignNames = pgTable(
  "mtg_card_foreign_names",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    cardId: text("card_id").notNull(),
    name: text("name"),
    language: text("language"),
    multiverseid: integer("multiverseid"),
  },
  (t) => ({
    idxCard: index("idx_mtg_foreign_card").on(t.cardId),
    uqForeign: uniqueIndex("mtg_card_foreign_names_uq_idx").on(
      t.cardId,
      t.language,
      t.name
    ),
  })
);

/* =========================
   mtg_catalog_items
   ========================= */
export const mtgCatalogItems = pgTable(
  "mtg_catalog_items",
  {
    catalog: text("catalog").notNull(),
    item: text("item").notNull(),
  },
  (t) => ({
    pk: primaryKey({ name: "mtg_catalog_items_pkey", columns: [t.catalog, t.item] }),
  })
);

/* =========================
   mtg_formats / mtg_subtypes / mtg_supertypes / mtg_types / mtg_symbols
   ========================= */
export const mtgFormats = pgTable("mtg_formats", {
  name: text("name").primaryKey(),
});

export const mtgSubtypes = pgTable("mtg_subtypes", {
  name: text("name").primaryKey(),
});

export const mtgSupertypes = pgTable("mtg_supertypes", {
  name: text("name").primaryKey(),
});

export const mtgTypes = pgTable("mtg_types", {
  name: text("name").primaryKey(),
});

export const mtgSymbols = pgTable("mtg_symbols", {
  symbol: text("symbol").primaryKey(),
  looseVariant: text("loose_variant"),
  english: text("english"),
  transposable: boolean("transposable"),
  representsMana: boolean("represents_mana"),
  appearsInManaCosts: boolean("appears_in_mana_costs"),
  funny: boolean("funny"),
  colors: jsonb("colors"),
  gathererAlternates: jsonb("gatherer_alternates"),
  svgUri: text("svg_uri"),
  manaValue: numeric("mana_value", { precision: 10, scale: 2 }),
});

/* =========================
   Raw SQL helpers (optional)
   =========================
   Drizzle supports btree indexes directly. For your existing specialized GIN/TRGM indexes
   (shown in Neon) you can keep them as-is or create them via a migration:

   Example migration (keep in a .sql migration file):
   --------------------------------------------------
   CREATE INDEX IF NOT EXISTS idx_mtg_cards_colors_gin ON public.mtg_cards USING gin (colors);
   CREATE INDEX IF NOT EXISTS idx_mtg_cards_name_trgm  ON public.mtg_cards USING gin (name gin_trgm_ops);
   CREATE INDEX IF NOT EXISTS idx_mtg_cards_type_trgm  ON public.mtg_cards USING gin (type_line gin_trgm_ops);
   CREATE INDEX IF NOT EXISTS idx_mtg_sets_block_trgm  ON public.mtg_sets  USING gin (block gin_trgm_ops);
   CREATE INDEX IF NOT EXISTS idx_mtg_sets_name_trgm   ON public.mtg_sets  USING gin (name gin_trgm_ops);
*/
