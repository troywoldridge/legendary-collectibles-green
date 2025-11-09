import { pgTable, serial, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const ebayEvents = pgTable("ebay_events", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),        // "platform" | "marketplace-deletion"
  eventType: text("event_type").notNull(), // e.g., "ItemListed", "FixedPriceTransaction"
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
