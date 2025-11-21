/* eslint-disable @typescript-eslint/no-unused-vars */
// src/lib/db/schema/billing.ts

import {
  pgTable,
  text,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";

// ---------------------------------------------
// billing_customers (maps Clerk user → Stripe customer)
// ---------------------------------------------
export const billingCustomers = pgTable("billing_customers", {
  userId: text("user_id").notNull().primaryKey(),
  stripeCustomerId: text("stripe_customer_id").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ---------------------------------------------
// user_plans (maps Clerk user → plan ID)
// ---------------------------------------------
export const userPlans = pgTable("user_plans", {
  userId: text("user_id").notNull().primaryKey(),
  planId: text("plan_id").notNull(), // "free" | "collector" | "pro"
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
