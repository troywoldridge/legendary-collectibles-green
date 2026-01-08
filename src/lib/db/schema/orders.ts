// src/lib/db/schema/orders.ts

import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { products } from "@/lib/db/schema/shop";
import { carts } from "@/lib/db/schema/cart";

export const orderStatus = pgEnum("order_status", [
  "pending",
  "paid",
  "fulfilled",
  "canceled",
  "refunded",
]);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id"),
    cartId: uuid("cart_id").references(() => carts.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    stripeSessionId: text("stripe_session_id").notNull(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    status: orderStatus("status").notNull().default("pending"),
    currency: text("currency").notNull().default("usd"),

    subtotalCents: integer("subtotal_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    shippingCents: integer("shipping_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),

    email: text("email"),
    customerName: text("customer_name"),
    customerPhone: text("customer_phone"),

    billingAddress: jsonb("billing_address"),
    shippingName: text("shipping_name"),
    shippingPhone: text("shipping_phone"),
    shippingAddress: jsonb("shipping_address"),

    stripeSessionRaw: jsonb("stripe_session_raw"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    stripeSessionIdx: index("orders_stripe_session_idx").on(t.stripeSessionId),
  })
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade", onUpdate: "cascade" }),

    // ✅ nullable
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),

    title: text("title").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    qty: integer("qty").notNull(),
    lineTotalCents: integer("line_total_cents").notNull(),

    imageUrl: text("image_url"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    orderIdx: index("order_items_order_idx").on(t.orderId),
    productIdx: index("order_items_product_idx").on(t.productId),
  })
);
