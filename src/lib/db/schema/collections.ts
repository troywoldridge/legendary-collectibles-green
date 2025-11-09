import { pgTable, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// plans you offer (Free is “virtual”, but you can still store it here for reference)
export const plans = pgTable("plans", {
  id: text("id").primaryKey(),               // "free" | "collector" | "pro"
  name: text("name").notNull(),
  // limits as JSON so you can evolve easily
  limits: jsonb("limits").notNull().$type<{
    maxCollections: number | null;  // null = unlimited
    maxItems: number | null;
    priceAlerts: number | null;
    wantlist: boolean;
    dailyValuation: boolean;
    pdfReports: boolean;
  }>(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

// one row per user’s current plan/subscription
export const userSubscriptions = pgTable("user_subscriptions", {
  userId: text("user_id").primaryKey(),      // Clerk user id
  planId: text("plan_id").notNull(),         // FK -> plans.id (enforce in DB if you want)
  provider: text("provider"),                // 'stripe'
  providerSubId: text("provider_sub_id"),
  status: text("status").notNull().default("active"), // 'active'|'past_due'|'canceled'
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

// user’s named collections
export const collections = pgTable("collections", {
  id: text("id").primaryKey(),               // cuid() or nanoid
  userId: text("user_id").notNull(),         // Clerk user id
  name: text("name").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

// generic card ref so it works for Pokémon, YGO, MTG, Sports, etc.
export const collectionItems = pgTable("collection_items", {
  id: text("id").primaryKey(),
  collectionId: text("collection_id").notNull(), // FK -> collections.id
  game: text("game").notNull(),                  // 'pokemon'|'yugioh'|'mtg'|'sports'|'funko'
  cardId: text("card_id").notNull(),             // the native PK in your source table
  // snapshots for faster UI and to keep history even if source changes
  cardName: text("card_name"),
  setName: text("set_name"),
  number: text("number"),
  imageUrl: text("image_url"),
  // condition / grading / quantities & economics
  quantity: integer("quantity").notNull().default(1),
  condition: text("condition"),                  // 'NM'|'LP'|'MP'|'HP'|'DMG' etc.
  gradeCompany: text("grade_company"),           // 'PSA'|'BGS'|'CGC' etc.
  grade: text("grade"),                          // '10','9.5', etc.
  purchasePriceCents: integer("purchase_price_cents"),
  currency: text("currency").default("USD"),
  acquiredAt: timestamp("acquired_at", { withTimezone: true, mode: "date" }),
  location: text("location"),                    // binder/box
  notes: text("notes"),
  // housekeeping
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const collectionRelations = relations(collections, ({ many }) => ({
  items: many(collectionItems),
}));
