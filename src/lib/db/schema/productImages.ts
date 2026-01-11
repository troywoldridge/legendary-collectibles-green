import { pgTable, text, integer, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { products } from "./products";

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade", onUpdate: "cascade" }),

    url: text("url").notNull(),
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
