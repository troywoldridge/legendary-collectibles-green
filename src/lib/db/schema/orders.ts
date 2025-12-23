// src/lib/db/schema/orders.ts
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { products } from "./shop";

// Keep it simple now; expand later (shipping, address, userId, etc.)
export const orderStatus = pgEnum("order_status", ["pending", "paid", "canceled", "refunded"]);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    status: orderStatus("status").notNull().default("pending"),

    currency: text("currency").notNull().default("usd"),

    subtotalCents: integer("subtotal_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),

    email: text("email"),
    stripeSessionId: text("stripe_session_id").notNull(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    stripeSessionUnique: uniqueIndex("orders_stripe_session_id_unique").on(t.stripeSessionId),
    statusIdx: index("orders_status_idx").on(t.status),
    createdIdx: index("orders_created_at_idx").on(t.createdAt),
  })
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade", onUpdate: "cascade" }),

    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict", onUpdate: "cascade" }),

    title: text("title").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    quantity: integer("quantity").notNull(),
    lineTotalCents: integer("line_total_cents").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orderIdx: index("order_items_order_id_idx").on(t.orderId),
    productIdx: index("order_items_product_id_idx").on(t.productId),
  })
);
