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

export const userCollectionItemValuations = pgTable(
  "user_collection_item_valuations",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    userId: text("user_id").notNull(),
    itemId: uuid("item_id").notNull(),

    asOfDate: date("as_of_date").notNull(),
    game: text("game"),

    valueCents: integer("value_cents").notNull().default(0),
    currency: text("currency").notNull().default("USD"),

    source: text("source"),
    confidence: text("confidence"),
    meta: jsonb("meta"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    itemDateSourceUnique: uniqueIndex(
      "ux_uc_item_vals_user_item_date_source",
    ).on(t.userId, t.itemId, t.asOfDate, t.source),

    userDateIdx: index("idx_uc_item_vals_user_date").on(t.userId, t.asOfDate),
    itemDateIdx: index("idx_uc_item_vals_item_date").on(t.itemId, t.asOfDate),
  }),
);



export type UserCollectionItemValuation =
  typeof userCollectionItemValuations.$inferSelect;



