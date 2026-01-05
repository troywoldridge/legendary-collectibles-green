// src/lib/db/schema/enums.ts
import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Put ONLY shared enums here.
 * (Do NOT import tables here to avoid circular deps.)
 */

// If you have a game enum used across multiple schema files:
export const game_enum = pgEnum("game_enum", ["pokemon", "yugioh", "mtg"]);

// If you need order/cart statuses, keep them here too:
export const cart_status_enum = pgEnum("cart_status_enum", ["open", "submitted", "abandoned"]);

export const order_status_enum = pgEnum("order_status_enum", [
  "pending",
  "paid",
  "fulfilled",
  "canceled",
  "refunded",
]);

// If you already have these enums in DB with different names/values,
// update the pgEnum name + values to match your real DB.
