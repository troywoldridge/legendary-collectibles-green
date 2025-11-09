// src/lib/db/schema/billing.ts
import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";

/** Plan catalog, with JSON limits */
export const plans = pgTable("plans", {
  id: text("id").primaryKey(), // 'free' | 'collector' | 'pro'
  name: text("name").notNull(),
  limits: jsonb("limits").$type<{
    maxCollections: number | null;
    maxItems: number | null;
    priceAlerts?: number | null;
    wantlist?: boolean | null;
    dailyValuation?: boolean | null;
    pdfReports?: boolean | null;
  }>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Simple per-user plan mapping (also used as fallback if no active subscription) */
export const userPlans = pgTable("user_plans", {
  userId: text("user_id").primaryKey(),
  planId: text("plan_id")
    .notNull()
    .references(() => plans.id, { onUpdate: "cascade", onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** If/when you use Stripe subscriptions */
export const userSubscriptions = pgTable("user_subscriptions", {
  id: text("id").primaryKey(), // you can store Stripe sub id here if you want
  userId: text("user_id").notNull(),
  planId: text("plan_id").references(() => plans.id, { onUpdate: "cascade", onDelete: "set null" }),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  stripePriceId: text("stripe_price_id"),
  status: text("status").notNull(), // 'active', 'trialing', 'past_due', 'canceled', etc.
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Stripe Customer linkage */
export const billingCustomers = pgTable("billing_customers", {
  userId: text("user_id").primaryKey(),
  stripeCustomerId: text("stripe_customer_id").notNull().unique(),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Optional: store webhook events for debugging/audit */
export const billingEvents = pgTable("billing_events", {
  id: text("id").primaryKey(),
  stripeEventId: text("stripe_event_id").unique(),
  type: text("type").notNull(),
  payload: jsonb("payload").$type<unknown>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
