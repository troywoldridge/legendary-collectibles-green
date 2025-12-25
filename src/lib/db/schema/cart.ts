// src/lib/db/schema/cart.ts
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { products } from "@/lib/db/schema/shop";

/**
 * Cart lifecycle:
 * - open: active cart in progress
 * - checked_out: completed purchase
 * - abandoned: optionally marked by cleanup job
 */
export const cartStatus = pgEnum("cart_status", ["open", "checked_out", "abandoned"]);

export const carts = pgTable(
  "carts",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    status: cartStatus("status").notNull().default("open"),

    // Attach if user is signed in (Clerk user id). Optional.
    userId: text("user_id"),

    // For guest checkout / email capture. Optional.
    email: text("email"),

    // Optional: when cart should be treated as expired (cleanup job can mark abandoned).
    expiresAt: timestamp("expires_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    statusIdx: index("carts_status_idx").on(t.status),
    userIdx: index("carts_user_idx").on(t.userId),
    emailIdx: index("carts_email_idx").on(t.email),
    updatedIdx: index("carts_updated_at_idx").on(t.updatedAt),
  })
);

export const cartLines = pgTable(
  "cart_lines",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),

    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade", onUpdate: "cascade" }),

    // legacy/optional: keep for now (some old code might still write it)
    productId: integer("product_id"),

    // ✅ main FK for shop products (uuid)
    listingId: uuid("listing_id").references(() => products.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),

    qty: integer("qty").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    cartIdx: index("cart_lines_cart_id_idx").on(t.cartId),
    listingIdx: index("cart_lines_listing_id_idx").on(t.listingId),
    productIdx: index("cart_lines_product_id_idx").on(t.productId),

    // Unique cart + listing
    cartListingUnique: uniqueIndex("ux_cart_lines_cart_listing")
      .on(t.cartId, t.listingId),
  })
);
