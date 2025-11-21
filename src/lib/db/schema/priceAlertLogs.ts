// src/lib/db/schema/priceAlertLogs.ts
import { pgTable, serial, text, timestamp, numeric } from "drizzle-orm/pg-core";

export const priceAlertLogs = pgTable("price_alert_logs", {
  id: serial("id").primaryKey(),

  alertId: text("alert_id").notNull(),
  cardId: text("card_id").notNull(),
  game: text("game").notNull(),

  priceUsd: numeric("price_usd", { precision: 12, scale: 2 }),
  firedAt: timestamp("fired_at").defaultNow().notNull(),
});
