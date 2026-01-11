// src/lib/db/schema/products.ts
import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";

// ✅ Postgres enums (from \dT+)
export const gameEnum = pgEnum("game", ["pokemon", "yugioh", "mtg"]);

export const productFormatEnum = pgEnum("product_format", ["single", "sealed"]);

export const graderEnum = pgEnum("grader", ["psa", "bgs", "cgc", "sgc"]);

export const cardConditionEnum = pgEnum("card_condition", [
  "nm",
  "lp",
  "mp",
  "hp",
  "dmg",
]);

export const inventoryTypeEnum = pgEnum("inventory_type", [
  "unique",
  "stock",
  "infinite",
]);

export const productStatusEnum = pgEnum("product_status", [
  "draft",
  "active",
  "archived",
]);

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    title: text("title").notNull(),
    slug: text("slug").notNull(),

    game: gameEnum("game").notNull(),
    format: productFormatEnum("format").notNull(),

    sealed: boolean("sealed").notNull().default(false),

    isGraded: boolean("is_graded").notNull().default(false),
    grader: graderEnum("grader"),
    gradeX10: integer("grade_x10"),

    condition: cardConditionEnum("condition"),

    priceCents: integer("price_cents").notNull(),
    compareAtCents: integer("compare_at_cents"),

    inventoryType: inventoryTypeEnum("inventory_type")
      .notNull()
      .default("stock"),

    quantity: integer("quantity").notNull().default(0),

    status: productStatusEnum("status").notNull().default("draft"),

    subtitle: text("subtitle"),
    description: text("description"),

    sku: text("sku"),
    cardKind: text("card_kind"), // DB check constraint enforces monster/spell/trap

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    slugUq: uniqueIndex("products_slug_key").on(t.slug),

    // Note: DB has a partial unique index on sku; drizzle can't fully encode the WHERE clause
    skuIdx: index("products_sku_unique").on(t.sku),

    gameFormatStatusIdx: index("products_game_format_status_idx").on(
      t.game,
      t.format,
      t.status
    ),
    statusPriceIdx: index("products_status_price_idx").on(t.status, t.priceCents),
    updatedAtIdx: index("products_updated_at_idx").on(t.updatedAt),
    graderGradeIdx: index("products_grader_grade_idx").on(t.grader, t.gradeX10),
  })
);
