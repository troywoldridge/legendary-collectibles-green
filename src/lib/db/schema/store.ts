// src/lib/db/schema/store.ts
import {
  pgTable,
  text,
  uuid,
  integer,
  boolean,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * store_listings = sellable inventory units (singles, graded, sealed, accessories).
 */
export const storeListings = pgTable(
  "store_listings",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Catalog-ish fields
    title: text("title").notNull(),
    description: text("description"),
    game: text("game").notNull(), // pokemon | yugioh | mtg | misc
    kind: text("kind").notNull().default("single"), // single | sealed | accessory
    status: text("status").notNull().default("active"), // active | draft | sold_out

    // Optional link back to canonical card tables
    // (pokemon tcgdex id like "bw10-26", ygo id, etc)
    cardId: text("card_id"),
    setName: text("set_name"),

    // Condition / grading (nullable for sealed)
    condition: text("condition"), // NM, LP, MP, HP, DMG, etc
    language: text("language").default("EN"),
    gradingCompany: text("grading_company"), // PSA/BGS/CGC/SGC/UNGR
    gradeLabel: text("grade_label"),         // "9", "10", "Ungraded"
    certNumber: text("cert_number"),

    // Pricing + inventory
    priceCents: integer("price_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    quantity: integer("quantity").notNull().default(0),

    // Shipping attributes (for future calculated shipping)
    shipWeightGrams: integer("ship_weight_grams").default(0),
    shipMeta: jsonb("ship_meta").default({}), // dimensions, packaging hints, etc

    // Media
    primaryImageUrl: text("primary_image_url"),

    // Flags
    featured: boolean("featured").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    gameIdx: index("idx_store_listings_game").on(t.game),
    statusIdx: index("idx_store_listings_status").on(t.status),
    cardIdx: index("idx_store_listings_card").on(t.game, t.cardId),
  }),
);

export const storeListingImages = pgTable(
  "store_listing_images",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    listingId: uuid("listing_id").notNull(),
    url: text("url").notNull(),
    sort: integer("sort").notNull().default(0),
    alt: text("alt"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    listingIdx: index("idx_store_listing_images_listing").on(t.listingId),
  }),
);
