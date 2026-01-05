/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  pgEnum,
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { game_enum } from "./enums";

// ✅ re-export under unique name to avoid barrel conflicts
export const proGameEnum = game_enum;

export const export_type_enum = pgEnum("export_type", [
  "price_sheet",
  "collection_csv",
  "insurance_pdf",
]);

export const alert_rule_type_enum = pgEnum("alert_rule_type", ["above", "below"]);

export const price_source_enum = pgEnum("price_source", [
  "tcgplayer",
  "cardmarket",
  "ebay",
  "amazon",
  "coolstuffinc",
]);

export const pro_exports = pgTable("pro_exports", {
  id: uuid("id").defaultRandom().primaryKey(),

  // ✅ keep Drizzle property names snake_case to match the rest of your codebase
  user_id: text("user_id").notNull(),

  type: export_type_enum("type").notNull(),

  // ✅ fix: game_enum (not game-enum)
  game: game_enum("game").notNull(),

  params: jsonb("params"),

  status: text("status").notNull().default("ready"),

  file_url: text("file_url"),

  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
