import { pgTable, text, integer, timestamp, primaryKey, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const scpSets = pgTable("scp_sets", {
  id: text("id").primaryKey(),            // slug from console-name
  name: text("name").notNull(),           // console-name exact value
  genre: text("genre"),                   // e.g., "Baseball Cards"
  releaseYear: integer("release_year"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const scpCards = pgTable("scp_cards", {
  id: text("id").primaryKey(),            // SportsCardsPro product id (string in API)
  setId: text("set_id").references(() => scpSets.id, { onDelete: "set null", onUpdate: "cascade" }),
  productName: text("product_name").notNull(),   // product-name
  consoleName: text("console_name").notNull(),   // console-name
  genre: text("genre"),
  releaseDate: text("release_date"),      // YYYY-MM-DD (keep string to avoid partials)
  salesVolume: integer("sales_volume"),
  imageUrl: text("image_url"),            // optional, not in API (placeholder for future)
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  setIdx: index("scp_cards_set_idx").on(t.setId),
  nameIdx: index("scp_cards_name_idx").on(t.productName),
}));

// ...

export const scpCardPrices = pgTable("scp_card_prices", {
  cardId: text("card_id").notNull().references(() => scpCards.id, { onDelete: "cascade" }),
  priceKey: text("price_key").notNull(),
  priceCents: integer("price_cents").notNull(),
  currency: text("currency").default("USD").notNull(),
  source: text("source").default("SportsCardsPro").notNull(),
  asOf: text("as_of")
    .notNull()
    .default(sql`to_char(CURRENT_DATE, 'YYYY-MM-DD')`), // ← DB-level default
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.cardId, t.priceKey] }),
}));
