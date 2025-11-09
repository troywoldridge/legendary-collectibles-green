import { pgTable, text, integer, timestamp, primaryKey, index, boolean, serial } from "drizzle-orm/pg-core";

export const sc_sources = pgTable("sc_sources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),          // "commons", "loc", "met"
  domain: text("domain").notNull(),      // commons.wikimedia.org, loc.gov, metmuseum.org
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sc_sets = pgTable("sc_sets", {
  id: text("id").primaryKey(),           // slug: sport-year-set
  sport: text("sport").notNull(),        // baseball | basketball | football
  year: integer("year"),
  name: text("name").notNull(),
  source: text("source").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  sportYearIdx: index("sc_sets_sport_year_idx").on(t.sport, t.year),
}));

export const sc_cards = pgTable("sc_cards", {
  id: text("id").primaryKey(),           // stable hash/slug of canonical key
  sport: text("sport").notNull(),
  year: integer("year"),
  setName: text("set_name"),
  number: text("number"),
  player: text("player"),
  team: text("team"),
  canonicalKey: text("canonical_key").notNull(), // sport|year|set|no|player
  source: text("source").notNull(),      // commons|loc|met
  sourceUrl: text("source_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniqCard: primaryKey({ columns: [t.id] }),
  canonicalIdx: index("sc_cards_canonical_idx").on(t.canonicalKey),
}));

export const sc_images = pgTable("sc_images", {
  id: serial("id").primaryKey(),
  cardId: text("card_id").notNull().references(() => sc_cards.id, { onDelete: "cascade" }),
  srcUrl: text("src_url").notNull(),
  license: text("license"),
  credit: text("credit"),
  width: integer("width"),
  height: integer("height"),
  sha256: text("sha256").notNull(),
  phash: text("phash").notNull(),        // hex pHash
  isPrimary: boolean("is_primary").default(true).notNull(),
  cfImageId: text("cf_image_id"),        // optional if you upload to Cloudflare Images
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniqExact: index("sc_images_sha256_idx").on(t.sha256),
  uniqPhash: index("sc_images_phash_idx").on(t.phash),
}));
