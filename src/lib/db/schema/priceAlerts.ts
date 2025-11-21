// src/lib/db/schema/priceAlerts.ts
import { pgTable, text, varchar, numeric, boolean, timestamp, serial } from "drizzle-orm/pg-core";

export const priceAlerts = pgTable("price_alerts", {
  id: serial("id").primaryKey(),

  userId: text("user_id").notNull(),
  game: varchar("game", { length: 20 }).notNull(),         // "pokemon" | "yugioh" | "mtg"
  cardId: text("card_id").notNull(),

  source: varchar("source", { length: 20 }).notNull(),     // "tcgplayer" | "cardmarket" | "ebay" | "pricecharting"
  ruleType: varchar("rule_type", { length: 20 }).notNull(),// "at_or_below" | "at_or_above"

  threshold: numeric("threshold", { precision: 12, scale: 2 }).notNull(),

  active: boolean("active").default(true).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});
