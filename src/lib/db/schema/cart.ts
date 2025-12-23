// src/lib/db/schema/cart.ts
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const carts = pgTable(
  "carts",
  {
    id: uuid("id").primaryKey(),
    status: text("status").default("open"),
    createdAt: timestamp("created_at", { withTimezone: false }).default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: false }).default(sql`now()`),
  },
  (t) => ({
    statusIdx: index("idx_carts_status").on(t.status),
  })
);

export const cartLines = pgTable(
  "cart_lines",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    cartId: uuid("cart_id").notNull(),
    productId: integer("product_id"), // legacy/optional
    listingId: uuid("listing_id"),    // ✅ use this for products.id (uuid)
    qty: integer("qty").notNull(),
    createdAt: timestamp("created_at", { withTimezone: false }).default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: false }).default(sql`now()`),
  },
  (t) => ({
    cartIdx: index("idx_cart_lines_cart_id").on(t.cartId),
    listingIdx: index("idx_cart_lines_listing_id").on(t.listingId),
    productIdx: index("idx_cart_lines_product_id").on(t.productId),

    // Matches your DB unique index semantics (cart_id, listing_id) where listing_id IS NOT NULL
    cartListingUnique: uniqueIndex("ux_cart_lines_cart_listing").on(t.cartId, t.listingId),
  })
);
