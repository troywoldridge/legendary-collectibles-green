// src/db/schema/collectionAnalytics.ts
import {
  pgTable,
  bigserial,
  text,
  integer,
  bigint,
  date,
  jsonb,
  timestamp,
  uuid,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Portfolio-level daily valuations                                   */
/* ------------------------------------------------------------------ */

export const userCollectionDailyValuations = pgTable(
  "user_collection_daily_valuations",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),

    userId: text("user_id").notNull(),
    asOfDate: date("as_of_date").notNull(),

    totalQuantity: integer("total_quantity").notNull(),
    distinctItems: integer("distinct_items").notNull(),

    totalCostCents: bigint("total_cost_cents", { mode: "number" }),
    totalValueCents: bigint("total_value_cents", { mode: "number" }),

    realizedPnlCents: bigint("realized_pnl_cents", { mode: "number" }),
    unrealizedPnlCents: bigint("unrealized_pnl_cents", { mode: "number" }),

    // Flexible JSON breakdown, e.g. { byGame: { pokemon: { quantity, valueCents }, ... } }
    breakdown: jsonb("breakdown").$type<{
      byGame?: Record<
        string,
        {
          quantity: number;
          valueCents: number;
        }
      >;
    }>(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userDateUnique: uniqueIndex(
      "user_collection_daily_valuations_user_date_uniq",
    ).on(t.userId, t.asOfDate),

    userDateIdx: index(
      "user_collection_daily_valuations_user_date_idx",
    ).on(t.userId, t.asOfDate),
  }),
);

/* ------------------------------------------------------------------ */
/* Per-item daily valuations (for card-level charts)                  */
/* ------------------------------------------------------------------ */

export const userCollectionItemValuations = pgTable(
  "user_collection_item_valuations",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),

    userId: text("user_id").notNull(),

    // In the DB this is a UUID referencing user_collection_items(id).
    // We don't wire the FK here to avoid importing another schema.
    itemId: uuid("item_id").notNull(),

    asOfDate: date("as_of_date").notNull(),

    game: text("game"),
    quantity: integer("quantity").notNull(),

    priceCents: integer("price_cents"),
    totalValueCents: integer("total_value_cents"),

    source: text("source"), // 'tcgplayer', 'cardmarket', 'ebay', etc.

    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    itemDateSourceUnique: uniqueIndex(
      "user_collection_item_valuations_item_date_source_uniq",
    ).on(t.itemId, t.asOfDate, t.source),

    userDateIdx: index(
      "user_collection_item_valuations_user_date_idx",
    ).on(t.userId, t.asOfDate),

    itemDateIdx: index(
      "user_collection_item_valuations_item_date_idx",
    ).on(t.itemId, t.asOfDate),
  }),
);

/* Optional helper types if you want them elsewhere */

export type UserCollectionDailyValuation =
  typeof userCollectionDailyValuations.$inferSelect;

export type UserCollectionItemValuation =
  typeof userCollectionItemValuations.$inferSelect;
