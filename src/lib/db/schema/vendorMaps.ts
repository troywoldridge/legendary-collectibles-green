// src/lib/db/schema/vendorMaps.ts
import {
  pgTable, text, varchar, numeric, timestamp,
  primaryKey, index
} from "drizzle-orm/pg-core";

export const tcgVendorMaps = pgTable(
  "tcg_vendor_maps",
  {
    category: varchar("category", { length: 16 }).notNull(),  // "pokemon" | "yugioh" | "mtg"
    game:     text("game").notNull(),
    cardId:   text("card_id").notNull(),
    vendor:   text("vendor").notNull(),                       // "ebay" | "amazon" | "coolstuffinc" | ...
    ident:    text("ident"),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    value:    numeric("value", { precision: 12, scale: 2 }),  // stored as string by driver
    query:    text("query"),
    urlHint:  text("url_hint"),
    url:      text("url"),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk:        primaryKey({ columns: [t.category, t.cardId, t.vendor], name: "tcg_vendor_maps_pk" }),
    cardIdx:   index("tcg_vendor_maps_card_idx").on(t.cardId),
    vendorIdx: index("tcg_vendor_maps_vendor_idx").on(t.vendor),
  })
);

export type TcgVendorMap = typeof tcgVendorMaps.$inferSelect;
export type NewTcgVendorMap = typeof tcgVendorMaps.$inferInsert;
