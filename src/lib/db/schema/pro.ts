/* eslint-disable @typescript-eslint/no-unused-vars */
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

