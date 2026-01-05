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
import { products } from "@/lib/db/schema/shop";

export const carts = pgTable(
  "carts",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    status: text("status").default("open"),

    user_id: text("user_id"),
    email: text("email"),
    expires_at: timestamp("expires_at", { withTimezone: true }),

    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    carts_status_idx: index("carts_status_idx").on(t.status),
    carts_user_idx: index("carts_user_idx").on(t.user_id),
    carts_email_idx: index("carts_email_idx").on(t.email),
    carts_updated_at_idx: index("carts_updated_at_idx").on(t.updated_at),
  })
);

export const cart_lines = pgTable(
  "cart_lines",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),

    cart_id: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade", onUpdate: "cascade" }),

    product_id: integer("product_id"),

    listing_id: uuid("listing_id").references(() => products.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),

    qty: integer("qty").notNull(),

    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    idx_cart_lines_cart_id: index("idx_cart_lines_cart_id").on(t.cart_id),
    idx_cart_lines_listing_id: index("idx_cart_lines_listing_id").on(t.listing_id),
    idx_cart_lines_product_id: index("idx_cart_lines_product_id").on(t.product_id),

    ux_cart_lines_cart_listing: uniqueIndex("ux_cart_lines_cart_listing").on(t.cart_id, t.listing_id),
  })
);
