// src/lib/db/schema/cart.ts
import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { carts } from "@/lib/db/schema/schema"; // adjust import if your carts table lives elsewhere

export const cartUsers = pgTable(
  "cart_users",
  {
    userId: text("user_id").notNull().primaryKey(),
    cartId: uuid("cart_id").notNull(),
    createdAt: timestamp("created_at", { mode: "string" }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow(),
  },
  (t) => ({
    cartIdIdx: index("idx_cart_users_cart_id").on(t.cartId),
  }),
);
