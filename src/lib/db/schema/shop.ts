// src/db/schema/shop.ts
import {
  pgEnum,
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// -------------------------
// Enums (stable forever)
// -------------------------

export const gameEnum = pgEnum("game", ["pokemon", "yugioh", "mtg", "sports"]);

export const productFormatEnum = pgEnum("product_format", [
  "single",
  "pack",
  "box",
  "bundle",
  "lot",
  "accessory",
]);

export const conditionEnum = pgEnum("card_condition", [
  "nm",
  "lp",
  "mp",
  "hp",
  "dmg",
  "new_factory_sealed",
]);

export const graderEnum = pgEnum("grader", ["psa", "bgs", "cgc", "sgc"]);

export const inventoryTypeEnum = pgEnum("inventory_type", [
  "unique",
  "stock",
  "infinite",
]);

export const productStatusEnum = pgEnum("product_status", [
  "active",
  "draft",
  "archived",
]);

// -------------------------
// Products (core listing)
// -------------------------

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    title: text("title").notNull(),
    slug: text("slug").notNull(), // unique

    game: gameEnum("game").notNull(),
    format: productFormatEnum("format").notNull(),

    // Trust builders
    sealed: boolean("sealed").notNull().default(false),

    // Grading / condition
    isGraded: boolean("is_graded").notNull().default(false),
    grader: graderEnum("grader"), // nullable
    gradeX10: integer("grade_x10"), // nullable: 100=10, 95=9.5, 0..100
    condition: conditionEnum("condition"), // nullable (usually for raw cards)

    // Pricing
    priceCents: integer("price_cents").notNull(),
    compareAtCents: integer("compare_at_cents"), // nullable for sales

    // Inventory
    inventoryType: inventoryTypeEnum("inventory_type").notNull().default("stock"),
    quantity: integer("quantity").notNull().default(0),

    status: productStatusEnum("status").notNull().default("draft"),

    // Optional: short marketing copy / quick details
    subtitle: text("subtitle"),
    description: text("description"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    slugUnique: uniqueIndex("products_slug_unique").on(t.slug),

    // Common filtering indexes (money makers)
    gameFormatStatusIdx: index("products_game_format_status_idx").on(
      t.game,
      t.format,
      t.status
    ),
    statusPriceIdx: index("products_status_price_idx").on(t.status, t.priceCents),
    sealedIdx: index("products_sealed_idx").on(t.sealed),
    gradedIdx: index("products_is_graded_idx").on(t.isGraded),
    graderGradeIdx: index("products_grader_grade_idx").on(t.grader, t.gradeX10),
    conditionIdx: index("products_condition_idx").on(t.condition),
    updatedAtIdx: index("products_updated_at_idx").on(t.updatedAt),
  })
);

// -------------------------
// Product images
// -------------------------

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      // If you already use relations elsewhere, we can add references() style.
      // Keeping it FK-safe below:
      .references(() => products.id, { onDelete: "cascade", onUpdate: "cascade" }),

    url: text("url").notNull(), // Cloudflare Images delivery URL
    alt: text("alt"),
    sort: integer("sort").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    productSortIdx: index("product_images_product_sort_idx").on(t.productId, t.sort),
  })
);

// -------------------------
// Tags (intent categories)
// (hot-deals, new-arrivals, best-sellers, gifts-under-50, etc.)
// -------------------------

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(), // unique, e.g. "hot-deals"
    name: text("name").notNull(), // display, e.g. "Hot Deals"

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    slugUnique: uniqueIndex("tags_slug_unique").on(t.slug),
  })
);

export const productTags = pgTable(
  "product_tags",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade", onUpdate: "cascade" }),

    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade", onUpdate: "cascade" }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: uniqueIndex("product_tags_unique").on(t.productId, t.tagId),
    productIdx: index("product_tags_product_idx").on(t.productId),
    tagIdx: index("product_tags_tag_idx").on(t.tagId),
  })
);

// -------------------------
// Optional: Keep updatedAt fresh automatically
// (If you do updates via Drizzle, you can set updatedAt in code instead)
// -------------------------

export const touchUpdatedAtSql = sql`
-- optional helper note:
-- If you want DB-side updated_at triggers, tell me and I’ll generate the migration SQL.
`;
