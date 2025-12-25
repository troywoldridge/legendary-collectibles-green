import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  pgEnum,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

export const inventoryStatusEnum = pgEnum("inventory_status", [
  "draft",
  "live",
  "archived",
]);

export const inventoryGameEnum = pgEnum("inventory_game", [
  "pokemon",
  "mtg",
  "yugioh",
  "sports",
  "funko",
  "sealed",
  "videogames",
  "supplies",
  "other",
]);

export const stockReasonEnum = pgEnum("inventory_stock_reason", [
  "IMPORT_ADD",
  "MANUAL_ADJUST",
  "SALE",
  "RETURN",
  "DAMAGE",
  "SHRINK",
]);

export const importRowStatusEnum = pgEnum("inventory_import_row_status", [
  "pending",
  "error",
  "applied",
]);

export const inventoryItems = pgTable(
  "inventory_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // identity / grouping
    game: inventoryGameEnum("game").notNull().default("other"),
    sku: text("sku").unique(), // optional, but recommended

    // display
    title: text("title").notNull(),
    condition: text("condition").notNull().default(""),
    status: inventoryStatusEnum("status").notNull().default("draft"),

    // pricing
    priceCents: integer("price_cents").notNull().default(0),
    costBasisCents: integer("cost_basis_cents").notNull().default(0),

    // cached stock
    onHand: integer("on_hand").notNull().default(0),

    // flexible fields: set name, card number, grade, language, etc.
    meta: jsonb("meta").$type<Record<string, any>>().notNull().default({}),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    skuIdx: index("inventory_items_sku_idx").on(t.sku),
    gameIdx: index("inventory_items_game_idx").on(t.game),
    statusIdx: index("inventory_items_status_idx").on(t.status),
  })
);

export const inventoryStockMovements = pgTable(
  "inventory_stock_movements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    itemId: uuid("item_id")
      .notNull()
      // if you have a drizzle relations setup, add FK in your migrations;
      // keeping simple here with logical FK
      ,

    delta: integer("delta").notNull(), // + adds stock, - removes stock
    reason: stockReasonEnum("reason").notNull().default("MANUAL_ADJUST"),
    note: text("note"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    itemIdx: index("inventory_stock_item_idx").on(t.itemId),
  })
);

export const inventoryItemImages = pgTable(
  "inventory_item_images",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    itemId: uuid("item_id").notNull(),
    url: text("url").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    itemIdx: index("inventory_images_item_idx").on(t.itemId),
  })
);

export const inventoryImportBatches = pgTable("inventory_import_batches", {
  id: uuid("id").defaultRandom().primaryKey(),
  filename: text("filename").notNull().default("upload.csv"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const inventoryImportRows = pgTable(
  "inventory_import_rows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    batchId: uuid("batch_id").notNull(),

    status: importRowStatusEnum("status").notNull().default("pending"),
    error: text("error"),

    // raw input and parsed fields
    raw: jsonb("raw").$type<Record<string, any>>().notNull().default({}),

    game: text("game"),
    sku: text("sku"),
    title: text("title"),
    condition: text("condition"),
    qtyDelta: integer("qty_delta"),
    priceCents: integer("price_cents"),
    costBasisCents: integer("cost_basis_cents"),
    notes: text("notes"),
    imageUrls: text("image_urls"), // comma-separated

    linkedItemId: uuid("linked_item_id"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    batchIdx: index("inventory_import_rows_batch_idx").on(t.batchId),
    statusIdx: index("inventory_import_rows_status_idx").on(t.status),
  })
);
