import { sql } from "drizzle-orm";
import {
  pgTable,
  bigserial,
  text,
  jsonb,
  timestamp,
  index,
  unique,
  primaryKey,
} from "drizzle-orm/pg-core";

/* ----------------------------- funko_pops ----------------------------- */

export const funkoPops = pgTable(
  "funko_pops",
  {
    id: bigserial("id", { mode: "number" }).notNull(), // BIGSERIAL
    handle: text("handle").notNull(),                  // UNIQUE NOT NULL
    title: text("title").notNull(),

    imageUrl: text("image_url"),
    series: text("series").array(),                    // TEXT[]
    raw: jsonb("raw").notNull().default(sql`'{}'::jsonb`),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),

    /* assorted optional metadata */
    image: text("image"),
    brand: text("brand"),
    number: text("number"),
    franchise: text("franchise"),
    category: text("category"),
    variants: jsonb("variants"),
    imageThumbUrl: text("image_thumb_url"),
    imageSource: text("image_source"),
    cfImageId: text("cf_image_id"),
    imageStatus: text("image_status"),
    imageCheckedAt: timestamp("image_checked_at", { withTimezone: true, mode: "date" }),
    imageImportedAt: timestamp("image_imported_at", { withTimezone: true, mode: "date" }),
    imageMeta: jsonb("image_meta"),
    externalUrl: text("external_url"),
    imgProvider: text("img_provider"),
    imgFoundAt: timestamp("img_found_at", { withTimezone: true, mode: "date" }),
    imageCfId: text("image_cf_id"),
  },
  (t) => ({
    // PK + unique
    pkey: primaryKey({ name: "funko_pops_pkey", columns: [t.id] }),
    handleUnique: unique("funko_pops_handle_key").on(t.handle),

    // Simple BTREE indexes that Drizzle supports in-code
    handleIdx: index("funko_pops_handle_idx").on(t.handle),

    // NOTE:
    // - GIN on series[]
    // - trigram on title
    // - expression indexes (image_missing / image_null)
    // should be created via raw SQL migrations to avoid Drizzle type issues.
  })
);

/* -------------------------- funko_products_raw ------------------------- */

export const funkoProductsRaw = pgTable(
  "funko_products_raw",
  {
    id: bigserial("id", { mode: "number" }).notNull(), // BIGSERIAL
    url: text("url").notNull(),                        // UNIQUE NOT NULL

    title: text("title"),
    brand: text("brand"),
    category: text("category"),
    sku: text("sku"),
    upc: text("upc"),
    number: text("number"),

    images: text("images").array(),
    imagePrimary: text("image_primary"),
    jsonld: jsonb("jsonld"),

    scrapedAt: timestamp("scraped_at", { withTimezone: true, mode: "date" }).defaultNow(),
    lastmod: timestamp("lastmod", { withTimezone: true, mode: "date" }),
  },
  (t) => ({
    pkey: primaryKey({ name: "funko_products_raw_pkey", columns: [t.id] }),
    urlUnique: unique("funko_products_raw_url_key").on(t.url),
  })
);
