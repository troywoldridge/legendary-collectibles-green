import { pgEnum, pgTable, uuid, text, timestamp, boolean, jsonb, numeric } from "drizzle-orm/pg-core";

export const gameEnum = pgEnum("game", ["yugioh", "pokemon", "mtg"]);
export const exportTypeEnum = pgEnum("export_type", ["price_sheet", "collection_csv", "insurance_pdf"]);
export const alertRuleTypeEnum = pgEnum("alert_rule_type", ["above", "below"]);
export const priceSourceEnum = pgEnum("price_source", ["tcgplayer", "cardmarket", "ebay", "amazon", "coolstuffinc"]);

export const proExports = pgTable("pro_exports", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  type: exportTypeEnum("type").notNull(),
  game: gameEnum("game"),
  params: jsonb("params"),
  status: text("status").notNull().default("ready"), // ready|error
  fileUrl: text("file_url"),                          // optional if you persist to R2
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const priceAlerts = pgTable("price_alerts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  game: gameEnum("game").notNull(),
  targetCardId: text("target_card_id").notNull(),
  source: priceSourceEnum("source").notNull(),        // which price field to read
  ruleType: alertRuleTypeEnum("rule_type").notNull(), // above|below
  threshold: numeric("threshold", { precision: 10, scale: 2 }).notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
});
