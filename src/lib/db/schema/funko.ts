// src/lib/db/schema/funko.ts
import { pgTable, text, boolean, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Canonical Funko catalog table (collection-side, NOT shop).
 *
 * Primary key is a string canonical id so you can merge sources later:
 * - funko:<internalId>
 * - hobbydb:<id>
 * - ppg:<id>
 */
export const funko_items = pgTable(
  "funko_items",
  {
    id: text("id").primaryKey(),

    name: text("name"),
    franchise: text("franchise"),
    series: text("series"),
    line: text("line"),

    // keep as text because Funko numbering can be weird (leading zeros, letter suffixes, etc.)
    number: text("number"),

    edition: text("edition"),
    variant: text("variant"),

    is_chase: boolean("is_chase").notNull().default(false),
    is_exclusive: boolean("is_exclusive").notNull().default(false),
    exclusivity: text("exclusivity"),

    release_year: integer("release_year"),

    upc: text("upc"),
    description: text("description"),

    image_small: text("image_small"),
    image_large: text("image_large"),

    // where it came from (optional but super useful for merges / re-sync)
    source: text("source"), // e.g. "manual", "hobbydb", "ppg"
    source_id: text("source_id"),

    extra: jsonb("extra").notNull().default(sql`'{}'::jsonb`),

    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // basic lookup indexes
    franchiseIdx: index("funko_items_franchise_idx").on(t.franchise),
    seriesIdx: index("funko_items_series_idx").on(t.series),
    numberIdx: index("funko_items_number_idx").on(t.number),
    releaseYearIdx: index("funko_items_release_year_idx").on(t.release_year),

    // Optional: full-text search index for name (matches the raw SQL idea)
    // Note: this uses a functional index, so we use sql``.
    nameTsvIdx: index("funko_items_name_tsv_idx").using(
      "gin",
      sql`to_tsvector('english', coalesce(${t.name}, ''))`,
    ),
  }),
);

/**
 * Optional structured variant flags (like tcg_card_variants).
 * Keep this even if you still store freeform variant text on funko_items,
 * because flags make filtering way nicer.
 */
export const funko_item_variants = pgTable("funko_item_variants", {
  item_id: text("item_id")
    .primaryKey()
    .references(() => funko_items.id, { onDelete: "cascade" }),

  chase: boolean("chase").notNull().default(false),
  glow: boolean("glow").notNull().default(false),
  metallic: boolean("metallic").notNull().default(false),
  flocked: boolean("flocked").notNull().default(false),
  glitter: boolean("glitter").notNull().default(false),
  translucent: boolean("translucent").notNull().default(false),
  chrome: boolean("chrome").notNull().default(false),
  jumbo: boolean("jumbo").notNull().default(false),

  // if you want a single canonical flag for glow-in-the-dark
  gitd: boolean("gitd").notNull().default(false),

  notes: text("notes"),
});
