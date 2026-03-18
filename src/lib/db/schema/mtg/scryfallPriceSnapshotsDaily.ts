import {
  pgTable,
  bigserial,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  date,
  timestamp,
  jsonb,
  index,
  uniqueIndex
} from "drizzle-orm/pg-core";

/**
 * Daily MTG price snapshots from Scryfall
 *
 * Lean storage design:
 *  - identifiers
 *  - print metadata
 *  - daily numeric prices
 *  - compact prices_raw JSON
 */

export const scryfallPriceSnapshotsDaily = pgTable(
  "skryfall_price_snapshots_daily",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),

    snapshotDate: date("snapshot_date").notNull(),

    sourceUpdatedAt: timestamp("source_updated_at", {
      withTimezone: true,
    }),

    ingestedAt: timestamp("ingested_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),

    /* -------------------------
       Core identifiers
    -------------------------- */

    scryfallId: uuid("scryfall_id").notNull(),

    oracleId: uuid("oracle_id"),

    tcgplayerId: integer("tcgplayer_id"),

    tcgplayerEtchedId: integer("tcgplayer_etched_id"),

    cardmarketId: integer("cardmarket_id"),

    /* -------------------------
       Card identity
    -------------------------- */

    lang: text("lang").notNull(),

    name: text("name").notNull(),

    printedName: text("printed_name"),

    setCode: text("set_code").notNull(),

    setName: text("set_name").notNull(),

    setId: uuid("set_id"),

    collectorNumber: text("collector_number").notNull(),

    rarity: text("rarity"),

    releasedAt: date("released_at"),

    /* -------------------------
       Print metadata
    -------------------------- */

    layout: text("layout"),

    typeLine: text("type_line"),

    reprint: boolean("reprint").notNull().default(false),

    digital: boolean("digital").notNull().default(false),

    promo: boolean("promo").notNull().default(false),

    reserved: boolean("reserved").notNull().default(false),

    games: text("games").array().notNull().default([]),

    finishes: text("finishes").array().notNull().default([]),

    /* -------------------------
       Price fields
    -------------------------- */

    usd: numeric("usd", { precision: 12, scale: 2 }),

    usdFoil: numeric("usd_foil", { precision: 12, scale: 2 }),

    usdEtched: numeric("usd_etched", { precision: 12, scale: 2 }),

    eur: numeric("eur", { precision: 12, scale: 2 }),

    eurFoil: numeric("eur_foil", { precision: 12, scale: 2 }),

    eurEtched: numeric("eur_etched", { precision: 12, scale: 2 }),

    tix: numeric("tix", { precision: 12, scale: 2 }),

    hasAnyPrice: boolean("has_any_price").notNull().default(false),

    /* -------------------------
       Compact JSON payloads
    -------------------------- */

    pricesRaw: jsonb("prices_raw").notNull().default({}),

    purchaseUris: jsonb("purchase_uris"),

    sourceUri: text("source_uri"),

    scryfallUri: text("scryfall_uri"),
  },
  (table) => ({
    uqSnapshotCard: uniqueIndex(
      "uq_skryfall_price_snapshots_daily"
    ).on(table.snapshotDate, table.scryfallId),

    snapshotDateIdx: index(
      "idx_skryfall_price_snapshots_daily_snapshot_date"
    ).on(table.snapshotDate),

    scryfallIdIdx: index(
      "idx_skryfall_price_snapshots_daily_scryfall_id"
    ).on(table.scryfallId),

    oracleIdIdx: index(
      "idx_skryfall_price_snapshots_daily_oracle_id"
    ).on(table.oracleId),

    tcgplayerIdIdx: index(
      "idx_skryfall_price_snapshots_daily_tcgplayer_id"
    ).on(table.tcgplayerId),

    cardmarketIdIdx: index(
      "idx_skryfall_price_snapshots_daily_cardmarket_id"
    ).on(table.cardmarketId),

    setCodeNumberIdx: index(
      "idx_skryfall_price_snapshots_daily_set_code_number"
    ).on(table.setCode, table.collectorNumber),

    pricePresenceIdx: index(
      "idx_skryfall_price_snapshots_daily_has_any_price"
    ).on(table.snapshotDate, table.hasAnyPrice),
  })
);