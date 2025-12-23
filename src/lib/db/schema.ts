// src/lib/db/schema.ts
// Drizzle schema for all tables you listed from the Neon DB export.
// Adjust types where necessary (this is intentionally conservative — text for custom/enums).

import {
  pgTable,
  serial,
  integer,
  index,
  text,
  boolean,
  timestamp,
  numeric,
  uuid,
  jsonb,
  primaryKey,
  varchar,
  bigserial,
  bigint
} from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

/**
 * E-commerce tables
 */

// cart_lines
export const cart_lines = pgTable("cart_lines", {
  id: serial("id").primaryKey(),
  cart_id: uuid("cart_id").notNull(),
  product_id: integer("product_id").notNull(),
  qty: integer("qty").notNull(),
  created_at: timestamp("created_at"),
  updated_at: timestamp("updated_at"),
});

// carts
export const carts = pgTable("carts", {
  id: uuid("id").primaryKey(),
  status: text("status"),
  created_at: timestamp("created_at"),
  updated_at: timestamp("updated_at"),
});

// categories
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  slug: text("slug"),
  name: text("name"),
  description: text("description"),
  cf_image_id: text("cf_image_id"),
  cf_alt: text("cf_alt"),
  sort_order: integer("sort_order"),
  created_at: timestamp("created_at"),
  updated_at: timestamp("updated_at"),
});

// images
export const images = pgTable("images", {
  id: serial("id").primaryKey(),
  // owner_type and variant were USER-DEFINED in PG; store as text here
  owner_type: text("owner_type"),
  owner_id: integer("owner_id"),
  variant: text("variant"),
  cf_image_id: text("cf_image_id"),
  url: text("url"),
  alt: text("alt"),
  sort_order: integer("sort_order"),
  created_at: timestamp("created_at"),
  updated_at: timestamp("updated_at"),
});

// orders
export const orders = pgTable("orders", {
  id: uuid("id").primaryKey(),
  cart_id: uuid("cart_id"),
  stripe_payment_intent_id: text("stripe_payment_intent_id"),
  amount_cents: integer("amount_cents"),
  currency: text("currency"),
  status: text("status"),
  created_at: timestamp("created_at"),
  updated_at: timestamp("updated_at"),
});

// products
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  subcategory_id: integer("subcategory_id"),
  sku: text("sku"),
  name: text("name"),
  description: text("description"),
  image_url: text("image_url"),
  cf_image_id: text("cf_image_id"),
  cf_alt: text("cf_alt"),
  price_cents: integer("price_cents"),
  msrp_cents: integer("msrp_cents"),
  inventory: integer("inventory"),
  in_stock: boolean("in_stock"),
  sort_order: integer("sort_order"),
  created_at: timestamp("created_at"),
  updated_at: timestamp("updated_at"),
});

// subcategories
export const subcategories = pgTable("subcategories", {
  id: serial("id").primaryKey(),
  category_id: integer("category_id"),
  slug: text("slug"),
  name: text("name"),
  description: text("description"),
  cf_image_id: text("cf_image_id"),
  cf_alt: text("cf_alt"),
  sort_order: integer("sort_order"),
  created_at: timestamp("created_at"),
  updated_at: timestamp("updated_at"),
});

/**
 * TCG-specific tables (Pokemon/TCG data)
 * These files were mostly `text` typed in the DB export — keep as text.
 */

// tcg_card_abilities
export const tcg_card_abilities = pgTable("tcg_card_abilities", {
  card_id: text("card_id").notNull(),
  name: text("name"),
  text: text("text"),
  type: text("type"),
  slot: text("slot"),
});

// tcg_card_attacks
export const tcg_card_attacks = pgTable("tcg_card_attacks", {
  card_id: text("card_id").notNull(),
  slot: text("slot"),
  name: text("name"),
  text: text("text"),
  damage: text("damage"),
  converted_energy_cost: text("converted_energy_cost"),
  cost: text("cost"),
});

// tcg_card_images
export const tcg_card_images = pgTable("tcg_card_images", {
  card_id: text("card_id").notNull(),
  small: text("small"),
  large: text("large"),
  source: text("source"),
});

// tcg_card_legalities
export const tcg_card_legalities = pgTable("tcg_card_legalities", {
  card_id: text("card_id").notNull(),
  format: text("format"),
  legality: text("legality"),
});

// tcg_card_prices_cardmarket
export const tcg_card_prices_cardmarket = pgTable(
  "tcg_card_prices_cardmarket",
  {
    card_id: text("card_id").notNull(),
    url: text("url"),
    updated_at: text("updated_at"),
    average_sell_price: text("average_sell_price"),
    low_price: text("low_price"),
    trend_price: text("trend_price"),
    german_pro_low: text("german_pro_low"),
    suggested_price: text("suggested_price"),
    reverse_holo_sell: text("reverse_holo_sell"),
    reverse_holo_low: text("reverse_holo_low"),
    reverse_holo_trend: text("reverse_holo_trend"),
    low_price_ex_plus: text("low_price_ex_plus"),
    avg1: text("avg1"),
    avg7: text("avg7"),
    avg30: text("avg30"),
    reverse_holo_avg1: text("reverse_holo_avg1"),
    reverse_holo_avg7: text("reverse_holo_avg7"),
    reverse_holo_avg30: text("reverse_holo_avg30"),
  }
);

// tcg_card_prices_tcgplayer
export const tcg_card_prices_tcgplayer = pgTable(
  "tcg_card_prices_tcgplayer",
  {
    card_id: text("card_id").notNull(),
    url: text("url"),
    updated_at: text("updated_at"),
    normal: text("normal"),
    holofoil: text("holofoil"),
    reverse_holofoil: text("reverse_holofoil"),
    first_edition_holofoil: text("first_edition_holofoil"),
    first_edition_normal: text("first_edition_normal"),
    currency: text("currency"),
  }
);

// tcg_card_resistances
export const tcg_card_resistances = pgTable("tcg_card_resistances", {
  card_id: text("card_id").notNull(),
  type: text("type"),
  value: text("value"),
  slot: text("slot"),
});

// tcg_card_weaknesses
export const tcg_card_weaknesses = pgTable("tcg_card_weaknesses", {
  card_id: text("card_id").notNull(),
  type: text("type"),
  value: text("value"),
  slot: text("slot"),
});

// tcg_cards
export const tcg_cards = pgTable("tcg_cards", {
  id: text("id").primaryKey(), // original exported as text IDs
  name: text("name"),
  supertype: text("supertype"),
  subtypes: text("subtypes"),
  level: text("level"),
  hp: text("hp"),
  types: text("types"),
  evolves_from: text("evolves_from"),
  evolves_to: text("evolves_to"),
  rules: text("rules"),
  ancient_trait_name: text("ancient_trait_name"),
  ancient_trait_text: text("ancient_trait_text"),
  converted_retreat_cost: text("converted_retreat_cost"),
  retreat_cost: text("retreat_cost"),
  set_id: text("set_id"),
  set_name: text("set_name"),
  series: text("series"),
  printed_total: text("printed_total"),
  total: text("total"),
  ptcgo_code: text("ptcgo_code"),
  release_date: text("release_date"),
  set_updated_at: text("set_updated_at"),
  symbol_url: text("symbol_url"),
  logo_url: text("logo_url"),
  regulation_mark: text("regulation_mark"),
  artist: text("artist"),
  rarity: text("rarity"),
  flavor_text: text("flavor_text"),
  national_pokedex_numbers: text("national_pokedex_numbers"),
  extra: text("extra"),
  small_image: text("small_image"),
  large_image: text("large_image"),
  tcgplayer_url: text("tcgplayer_url"),
  tcgplayer_updated_at: text("tcgplayer_updated_at"),
  cardmarket_url: text("cardmarket_url"),
  cardmarket_updated_at: text("cardmarket_updated_at"),
});

// tcg_rarities
export const tcg_rarities = pgTable("tcg_rarities", {
  name: text("name"),
});

// tcg_sets
export const tcg_sets = pgTable("tcg_sets", {
  id: text("id").primaryKey(),
  name: text("name"),
  series: text("series"),
  printed_total: text("printed_total"),
  total: text("total"),
  ptcgo_code: text("ptcgo_code"),
  release_date: text("release_date"),
  updated_at: text("updated_at"),
  symbol_url: text("symbol_url"),
  logo_url: text("logo_url"),
  standard: text("standard"),
  expanded: text("expanded"),
  unlimited: text("unlimited"),
});

// tcg_sets_legalities
export const tcg_sets_legalities = pgTable("tcg_sets_legalities", {
  set_id: text("set_id"),
  format: text("format"),
  legality: text("legality"),
});

// tcg_subtypes
export const tcg_subtypes = pgTable("tcg_subtypes", {
  name: text("name"),
});

// tcg_supertypes
export const tcg_supertypes = pgTable("tcg_supertypes", {
  name: text("name"),
});

// tcg_types
export const tcg_types = pgTable("tcg_types", {
  name: text("name"),
});




export const tcgCardPricesTcgplayerHistory = pgTable("tcg_card_prices_tcgplayer_history", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  cardId: text("card_id").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
  currency: text("currency"),
  normal: numeric("normal", { precision: 12, scale: 2 }),
  holofoil: numeric("holofoil", { precision: 12, scale: 2 }),
  reverseHolofoil: numeric("reverse_holofoil", { precision: 12, scale: 2 }),
  firstEditionHolofoil: numeric("first_edition_holofoil", { precision: 12, scale: 2 }),
  firstEditionNormal: numeric("first_edition_normal", { precision: 12, scale: 2 }),
});

export const tcgCardPricesCardmarketHistory = pgTable("tcg_card_prices_cardmarket_history", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  cardId: text("card_id").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
  averageSellPrice: numeric("average_sell_price", { precision: 12, scale: 2 }),
  lowPrice: numeric("low_price", { precision: 12, scale: 2 }),
  trendPrice: numeric("trend_price", { precision: 12, scale: 2 }),
  germanProLow: numeric("german_pro_low", { precision: 12, scale: 2 }),
  suggestedPrice: numeric("suggested_price", { precision: 12, scale: 2 }),
  reverseHoloSell: numeric("reverse_holo_sell", { precision: 12, scale: 2 }),
  reverseHoloLow: numeric("reverse_holo_low", { precision: 12, scale: 2 }),
  reverseHoloTrend: numeric("reverse_holo_trend", { precision: 12, scale: 2 }),
  lowPriceExPlus: numeric("low_price_ex_plus", { precision: 12, scale: 2 }),
  avg1: numeric("avg1", { precision: 12, scale: 2 }),
  avg7: numeric("avg7", { precision: 12, scale: 2 }),
  avg30: numeric("avg30", { precision: 12, scale: 2 }),
  reverseHoloAvg1: numeric("reverse_holo_avg1", { precision: 12, scale: 2 }),
  reverseHoloAvg7: numeric("reverse_holo_avg7", { precision: 12, scale: 2 }),
  reverseHoloAvg30: numeric("reverse_holo_avg30", { precision: 12, scale: 2 }),
});

// -----------------------------
// ygo_cards
// -----------------------------
export const ygoCards = pgTable(
  "ygo_cards",
  {
    cardId: text("card_id").notNull(), // PK
    name: text("name").notNull(),
    type: text("type"),
    desc: text("desc"),
    atk: integer("atk"),
    def: integer("def"),
    level: integer("level"),
    race: text("race"),
    attribute: text("attribute"),
    archetype: text("archetype"),
    ygoprodeckUrl: text("ygoprodeck_url"),
    linkval: integer("linkval"),
    scale: integer("scale"),
    linkmarkers: text("linkmarkers").array(),
    hasEffect: boolean("has_effect"),
    staple: boolean("staple"),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.cardId], name: "ygo_cards_pkey" }),
  })
);
export const ygoCardsRelations = relations(ygoCards, ({ one, many }) => ({
  prices: one(ygoCardPrices, {
    fields: [ygoCards.cardId],
    references: [ygoCardPrices.cardId],
  }),
  banlist: one(ygoCardBanlist, {
    fields: [ygoCards.cardId],
    references: [ygoCardBanlist.cardId],
  }),
  images: many(ygoCardImages),
  priceHistory: many(ygoCardPricesHistory),
  sets: many(ygoCardSets),
}));

// -----------------------------
// ygo_card_prices
// -----------------------------
export const ygoCardPrices = pgTable(
  "ygo_card_prices",
  {
    cardId: text("card_id")
      .notNull()
      .references(() => ygoCards.cardId, { onDelete: "cascade" }),
    amazonPrice: text("amazon_price"),
    cardmarketPrice: text("cardmarket_price"),
    tcgplayerPrice: text("tcgplayer_price"),
    ebayPrice: text("ebay_price"),
    coolstuffincPrice: text("coolstuffinc_price"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.cardId], name: "ygo_card_prices_pkey" }),
  })
);

// -----------------------------
// ygo_card_prices_history
// -----------------------------
export const ygoCardPricesHistory = pgTable(
  "ygo_card_prices_history",
  {
    // DB already has a sequence default; we don't need to re-declare it in Drizzle
    id: bigint("id", { mode: "number" }).notNull().primaryKey(),
    cardId: text("card_id")
      .notNull()
      .references(() => ygoCards.cardId, { onDelete: "cascade" }),
    capturedAt: timestamp("captured_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    sourceUpdatedAt: timestamp("source_updated_at", {
      withTimezone: true,
      mode: "date",
    }),
    tcgplayerPrice: numeric("tcgplayer_price", { precision: 12, scale: 2 }),
    cardmarketPrice: numeric("cardmarket_price", { precision: 12, scale: 2 }),
    ebayPrice: numeric("ebay_price", { precision: 12, scale: 2 }),
    amazonPrice: numeric("amazon_price", { precision: 12, scale: 2 }),
    coolstuffincPrice: numeric("coolstuffinc_price", { precision: 12, scale: 2 }),
  }
);

export const ygoCardPricesHistoryRelations = relations(
  ygoCardPricesHistory,
  ({ one }) => ({
    card: one(ygoCards, {
      fields: [ygoCardPricesHistory.cardId],
      references: [ygoCards.cardId],
    }),
  })
);

// -----------------------------
// ygo_card_images
// -----------------------------
export const ygoCardImages = pgTable(
  "ygo_card_images",
  {
    cardId: text("card_id")
      .notNull()
      .references(() => ygoCards.cardId, { onDelete: "cascade" }),
    imageUrl: text("image_url").notNull(),
    imageUrlSmall: text("image_url_small"),
    imageId: text("image_id"),
  },
  (t) => ({
    pk: primaryKey({
      columns: [t.cardId, t.imageUrl],
      name: "ygo_card_images_pkey",
    }),
  })
);

export const ygoCardImagesRelations = relations(ygoCardImages, ({ one }) => ({
  card: one(ygoCards, {
    fields: [ygoCardImages.cardId],
    references: [ygoCards.cardId],
  }),
}));

// -----------------------------
// ygo_card_banlist
// -----------------------------
export const ygoCardBanlist = pgTable(
  "ygo_card_banlist",
  {
    cardId: text("card_id")
      .notNull()
      .references(() => ygoCards.cardId, { onDelete: "cascade" }),
    banTcg: text("ban_tcg"),
    banOcg: text("ban_ocg"),
    banGoat: text("ban_goat"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.cardId], name: "ygo_card_banlist_pkey" }),
  })
);


// ygo_card_sets  (minimal columns used in your queries)
export const ygoCardSets = pgTable(
  "ygo_card_sets",
  {
    cardId: text("card_id")
      .notNull()
      .references(() => ygoCards.cardId, { onDelete: "cascade" }),
    setName: text("set_name"),
    setCode: text("set_code"),
    setRarity: text("set_rarity"),

    // ✅ needed for YGOPRODeck import
    setRarityCode: text("set_rarity_code"),
    setPrice: numeric("set_price", { precision: 12, scale: 2 }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.cardId, t.setCode] }),
  })
);


export const ygoCardSetsRelations = relations(ygoCardSets, ({ one }) => ({
  card: one(ygoCards, {
    fields: [ygoCardSets.cardId],
    references: [ygoCards.cardId],
  }),
}));

// -----------------------------
// ygo_raw_dump
// -----------------------------
export const ygoRawDump = pgTable(
  "ygo_raw_dump",
  {
    id: text("id").notNull().default("cardinfo_v7"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    payload: jsonb("payload").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.id], name: "ygo_raw_dump_pkey" }),
  })
);

// -----------------------------
// Convenient TS types
// -----------------------------
export type YgoCard = typeof ygoCards.$inferSelect;
export type NewYgoCard = typeof ygoCards.$inferInsert;

export type YgoCardPrice = typeof ygoCardPrices.$inferSelect;
export type NewYgoCardPrice = typeof ygoCardPrices.$inferInsert;

export type YgoCardPriceHistory = typeof ygoCardPricesHistory.$inferSelect;
export type NewYgoCardPriceHistory = typeof ygoCardPricesHistory.$inferInsert;

export type YgoCardImage = typeof ygoCardImages.$inferSelect;
export type NewYgoCardImage = typeof ygoCardImages.$inferInsert;

export type YgoCardBanlist = typeof ygoCardBanlist.$inferSelect;
export type NewYgoCardBanlist = typeof ygoCardBanlist.$inferInsert;

export type YgoCardSet = typeof ygoCardSets.$inferSelect;
export type NewYgoCardSet = typeof ygoCardSets.$inferInsert;

export type YgoRawDump = typeof ygoRawDump.$inferSelect;
export type NewYgoRawDump = typeof ygoRawDump.$inferInsert;



export const tcgVendorPrices = pgTable("tcg_vendor_prices", {
  game: text("game").notNull(),
  cardId: text("card_id").notNull(),
  vendor: text("vendor").notNull(),
  metric: text("metric").notNull().default("market"),
  currency: text("currency").notNull(),
  value: numeric("value"),
  url: text("url"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  meta: jsonb("meta"),
}, (t) => ({
  pk: primaryKey({ columns: [t.game, t.cardId, t.vendor] }),
}));

export const tcgVendorMaps = pgTable("tcg_vendor_maps", {
  category: varchar("category", { length: 16 }).notNull(),
  game: text("game").notNull(),
  cardId: text("card_id").notNull(),
  vendor: text("vendor").notNull(),
  ident: text("ident"),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  value: numeric("value", { precision: 12, scale: 2 }),
  query: text("query"),
  urlHint: text("url_hint"),
  url: text("url"),
   updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
 (t) => ({
  pk: primaryKey({ columns: [t.category, t.cardId, t.vendor] }),
}));


export type TcgVendorPrice = typeof tcgVendorPrices.$inferSelect;
export type NewTcgVendorPrice = typeof tcgVendorPrices.$inferInsert;

export const supportMessages = pgTable("support_messages", {
  ticketId: text("ticket_id").primaryKey(),
  name: text("name"),
  email: text("email").notNull(),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const emailEvents = pgTable(
  "email_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),

    provider: text("provider").notNull().default("resend"),

    // Provider/webhook identifiers
    eventId: text("event_id"),
    eventType: text("event_type").notNull(), // e.g. "email.delivered"
    emailId: text("email_id"),               // e.g. "email_123" (Resend mail id)
    messageId: text("message_id"),           // SMTP Message-ID

    // Subjects/addresses
    subject: text("subject"),
    fromAddress: text("from_address"),
    toCsv: text("to_csv"),                   // "a@b.com, c@d.com"

    // Timestamps
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }),
    emailCreatedAt: timestamp("email_created_at", { withTimezone: true, mode: "date" }),

    // Click/open metadata (when present)
    clickIp: text("click_ip"),
    clickLink: text("click_link"),
    clickTimestamp: timestamp("click_timestamp", { withTimezone: true, mode: "date" }),
    clickUserAgent: text("click_user_agent"),

    // Errors
    errorCode: text("error_code"),
    errorMessage: text("error_message"),

    // Misc
    idempotencyKey: text("idempotency_key"),
    raw: jsonb("raw"),                       // full provider payload
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (t) => ({
    byWhen: index("email_events_when_idx").on(t.occurredAt),
    byType: index("email_events_type_idx").on(t.eventType),
    byEmailId: index("email_events_email_id_idx").on(t.emailId),
    byMsgId: index("email_events_message_id_idx").on(t.messageId),
    byTo: index("email_events_to_idx").on(t.toCsv),
    bySubject: index("email_events_subject_idx").on(t.subject),
  })
);

export type EmailEvent = InferSelectModel<typeof emailEvents>;
export type NewEmailEvent = InferInsertModel<typeof emailEvents>;
// Re-export MTG schema tables (Scryfall sync expects these)
export * from "./schema/mtg";
