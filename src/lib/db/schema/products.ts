// src/lib/db/schema/products.ts
import { pgTable, integer, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const products = pgTable(
  "products",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),

    subcategoryId: integer("subcategory_id"),
    sku: text("sku"),
    name: text("name"),
    description: text("description"),

    imageUrl: text("image_url"),
    cfImageId: text("cf_image_id"),
    cfAlt: text("cf_alt"),

    priceCents: integer("price_cents"),
    msrpCents: integer("msrp_cents"),

    inventory: integer("inventory"),
    inStock: boolean("in_stock"),

    sortOrder: integer("sort_order"),

    createdAt: timestamp("created_at", { withTimezone: false }).default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: false }).default(sql`now()`),
  },
  (t) => ({
    subcatIdx: index("idx_products_subcategory_id").on(t.subcategoryId),
    stockIdx: index("idx_products_in_stock").on(t.inStock),
    priceIdx: index("idx_products_price").on(t.priceCents),
  })
);
