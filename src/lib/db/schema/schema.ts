import { pgTable, index, unique, uuid, text, timestamp, bigserial, integer, jsonb, foreignKey, date, uniqueIndex, boolean, numeric, serial, bigint, primaryKey, varchar } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const marketItems = pgTable("market_items", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	game: text().notNull(),
	kind: text().default('card').notNull(),
	canonicalSource: text("canonical_source").notNull(),
	canonicalId: text("canonical_id").notNull(),
	displayName: text("display_name"),
	setName: text("set_name"),
	setCode: text("set_code"),
	number: text(),
	imageUrl: text("image_url"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_market_items_game").using("btree", table.game.asc().nullsLast().op("text_ops")),
	index("idx_mi_lookup").using("btree", table.game.asc().nullsLast().op("text_ops"), table.canonicalSource.asc().nullsLast().op("text_ops"), table.canonicalId.asc().nullsLast().op("text_ops")),
	unique("market_items_game_canonical_source_canonical_id_key").on(table.game, table.canonicalSource, table.canonicalId),
]);

export const pricechartingImportRuns = pgTable("pricecharting_import_runs", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	game: text().notNull(),
	fileName: text("file_name"),
	fileSha256: text("file_sha256"),
	importedAt: timestamp("imported_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	rowCount: integer("row_count").default(0).notNull(),
	meta: jsonb().default({}).notNull(),
});

export const tcgSupertypes = pgTable("tcg_supertypes", {
	name: text(),
});

export const tcgRarities = pgTable("tcg_rarities", {
	name: text(),
});

export const marketPricesCurrent = pgTable("market_prices_current", {
	marketItemId: uuid("market_item_id").primaryKey().notNull(),
	currency: text().default('USD').notNull(),
	priceCents: integer("price_cents").notNull(),
	source: text().notNull(),
	priceType: text("price_type").notNull(),
	confidence: text().notNull(),
	asOfDate: date("as_of_date").notNull(),
	sourcesUsed: jsonb("sources_used").default({}).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_market_prices_current_as_of").using("btree", table.asOfDate.asc().nullsLast().op("date_ops")),
	index("idx_market_prices_current_item_source").using("btree", table.marketItemId.asc().nullsLast().op("text_ops"), table.source.asc().nullsLast().op("text_ops")),
	index("idx_market_prices_current_source").using("btree", table.source.asc().nullsLast().op("text_ops")),
	index("idx_mpc_item_currency").using("btree", table.marketItemId.asc().nullsLast().op("uuid_ops"), table.currency.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.marketItemId],
			foreignColumns: [marketItems.id],
			name: "market_prices_current_market_item_id_fkey"
		}).onDelete("cascade"),
]);

export const userPlans = pgTable("user_plans", {
	userId: text("user_id").primaryKey().notNull(),
	planId: text("plan_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_user_plans_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
]);

export const userCollectionItems = pgTable("user_collection_items", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	game: text().notNull(),
	cardId: text("card_id").notNull(),
	cardName: text("card_name").notNull(),
	setName: text("set_name"),
	imageUrl: text("image_url"),
	gradingCompany: text("grading_company"),
	gradeLabel: text("grade_label"),
	certNumber: text("cert_number"),
	quantity: integer().default(1).notNull(),
	folder: text(),
	costCents: integer("cost_cents"),
	lastValueCents: integer("last_value_cents"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	purchaseDate: date("purchase_date"),
}, (table) => [
	index("idx_user_collection_items_user").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("idx_user_collection_items_user_folder").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.folder.asc().nullsLast().op("text_ops")),
	index("idx_user_collection_items_user_game").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.game.asc().nullsLast().op("text_ops")),
	index("idx_user_collection_items_user_set").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.setName.asc().nullsLast().op("text_ops")),
	uniqueIndex("ux_user_collection_item_identity").using("btree", sql`user_id`, sql`game`, sql`card_id`, sql`COALESCE(grading_company, ''::text)`, sql`COALESCE(grade_label, ''::text)`, sql`COALESCE(cert_number, ''::text)`, sql`COALESCE(folder, ''::text)`),
]);

export const scryfallCardSymbols = pgTable("scryfall_card_symbols", {
	symbol: text().primaryKey().notNull(),
	looseVariant: text("loose_variant"),
	english: text().notNull(),
	transposable: boolean().default(false).notNull(),
	representsMana: boolean("represents_mana").default(false).notNull(),
	manaValue: numeric("mana_value"),
	appearsInManaCosts: boolean("appears_in_mana_costs").default(false).notNull(),
	funny: boolean().default(false).notNull(),
	colors: text().array().default(["RAY"]).notNull(),
	hybrid: boolean().default(false).notNull(),
	phyrexian: boolean().default(false).notNull(),
	gathererAlternates: text("gatherer_alternates").array(),
	svgUri: text("svg_uri"),
	payload: jsonb().notNull(),
	fetchedAt: timestamp("fetched_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_scryfall_symbols_colors").using("gin", table.colors.asc().nullsLast().op("array_ops")),
	index("idx_scryfall_symbols_represents_mana").using("btree", table.representsMana.asc().nullsLast().op("bool_ops")),
]);

export const scryfallSets = pgTable("scryfall_sets", {
	id: uuid().primaryKey().notNull(),
	code: text().notNull(),
	mtgoCode: text("mtgo_code"),
	arenaCode: text("arena_code"),
	tcgplayerId: integer("tcgplayer_id"),
	name: text().notNull(),
	setType: text("set_type").notNull(),
	releasedAt: date("released_at"),
	blockCode: text("block_code"),
	block: text(),
	parentSetCode: text("parent_set_code"),
	cardCount: integer("card_count").notNull(),
	printedSize: integer("printed_size"),
	digital: boolean().default(false).notNull(),
	foilOnly: boolean("foil_only").default(false).notNull(),
	nonfoilOnly: boolean("nonfoil_only").default(false).notNull(),
	scryfallUri: text("scryfall_uri").notNull(),
	uri: text().notNull(),
	iconSvgUri: text("icon_svg_uri"),
	searchUri: text("search_uri").notNull(),
	payload: jsonb().notNull(),
	fetchedAt: timestamp("fetched_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_scryfall_sets_released_at").using("btree", table.releasedAt.asc().nullsLast().op("date_ops")),
	index("idx_scryfall_sets_set_type").using("btree", table.setType.asc().nullsLast().op("text_ops")),
	index("idx_scryfall_sets_tcgplayer_id").using("btree", table.tcgplayerId.asc().nullsLast().op("int4_ops")),
	unique("scryfall_sets_code_key").on(table.code),
]);

export const scryfallCardsRaw = pgTable("scryfall_cards_raw", {
	id: uuid().primaryKey().notNull(),
	oracleId: uuid("oracle_id"),
	lang: text().notNull(),
	name: text().notNull(),
	layout: text(),
	setCode: text("set_code"),
	setId: uuid("set_id"),
	collectorNumber: text("collector_number"),
	releasedAt: date("released_at"),
	arenaId: integer("arena_id"),
	mtgoId: integer("mtgo_id"),
	mtgoFoilId: integer("mtgo_foil_id"),
	tcgplayerId: integer("tcgplayer_id"),
	tcgplayerEtchedId: integer("tcgplayer_etched_id"),
	cardmarketId: integer("cardmarket_id"),
	payload: jsonb().notNull(),
	fetchedAt: timestamp("fetched_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_scryfall_cards_arena_id").using("btree", table.arenaId.asc().nullsLast().op("int4_ops")),
	index("idx_scryfall_cards_cardmarket_id").using("btree", table.cardmarketId.asc().nullsLast().op("int4_ops")),
	index("idx_scryfall_cards_lang").using("btree", table.lang.asc().nullsLast().op("text_ops")),
	index("idx_scryfall_cards_mtgo_foil_id").using("btree", table.mtgoFoilId.asc().nullsLast().op("int4_ops")),
	index("idx_scryfall_cards_mtgo_id").using("btree", table.mtgoId.asc().nullsLast().op("int4_ops")),
	index("idx_scryfall_cards_oracle_id").using("btree", table.oracleId.asc().nullsLast().op("uuid_ops")),
	index("idx_scryfall_cards_set_code_num").using("btree", table.setCode.asc().nullsLast().op("text_ops"), table.collectorNumber.asc().nullsLast().op("text_ops")),
	index("idx_scryfall_cards_set_id").using("btree", table.setId.asc().nullsLast().op("uuid_ops")),
	index("idx_scryfall_cards_tcgplayer_etched_id").using("btree", table.tcgplayerEtchedId.asc().nullsLast().op("int4_ops")),
	index("idx_scryfall_cards_tcgplayer_id").using("btree", table.tcgplayerId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.setId],
			foreignColumns: [scryfallSets.id],
			name: "fk_scryfall_cards_set_id"
		}).onUpdate("cascade").onDelete("set null"),
]);

export const scryfallCatalogs = pgTable("scryfall_catalogs", {
	key: text().primaryKey().notNull(),
	endpoint: text().notNull(),
	uri: text().notNull(),
	totalValues: integer("total_values").notNull(),
	data: text().array().default(["RAY"]).notNull(),
	payload: jsonb().notNull(),
	fetchedAt: timestamp("fetched_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_scryfall_catalogs_endpoint").using("btree", table.endpoint.asc().nullsLast().op("text_ops")),
]);

export const userCollectionItemValuations = pgTable("user_collection_item_valuations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	itemId: uuid("item_id").notNull(),
	asOfDate: date("as_of_date").default(sql`CURRENT_DATE`).notNull(),
	valueCents: integer("value_cents").default(0).notNull(),
	currency: text().default('USD').notNull(),
	source: text(),
	confidence: text(),
	meta: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_uc_item_vals_item_date").using("btree", table.itemId.asc().nullsLast().op("date_ops"), table.asOfDate.desc().nullsFirst().op("uuid_ops")),
	index("idx_uc_item_vals_user_date").using("btree", table.userId.asc().nullsLast().op("date_ops"), table.asOfDate.desc().nullsFirst().op("date_ops")),
	uniqueIndex("ux_uc_item_vals_user_item_date_source").using("btree", sql`user_id`, sql`item_id`, sql`as_of_date`, sql`COALESCE(source, ''::text)`),
	foreignKey({
			columns: [table.itemId],
			foreignColumns: [userCollectionItems.id],
			name: "user_collection_item_valuations_item_id_fkey"
		}).onDelete("cascade"),
]);

export const userWishlistItems = pgTable("user_wishlist_items", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	game: text().notNull(),
	cardId: text("card_id").notNull(),
	cardName: text("card_name"),
	setName: text("set_name"),
	imageUrl: text("image_url"),
	marketItemId: uuid("market_item_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_user_wishlist_user").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("idx_user_wishlist_user_game").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.game.asc().nullsLast().op("text_ops")),
	uniqueIndex("ux_user_wishlist_user_game_card").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.game.asc().nullsLast().op("text_ops"), table.cardId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.marketItemId],
			foreignColumns: [marketItems.id],
			name: "user_wishlist_items_market_item_id_fkey"
		}).onDelete("set null"),
]);

export const cartLines = pgTable("cart_lines", {
	id: serial().primaryKey().notNull(),
	cartId: uuid("cart_id").notNull(),
	productId: integer("product_id").notNull(),
	qty: integer().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }),
	updatedAt: timestamp("updated_at", { mode: 'string' }),
});

export const carts = pgTable("carts", {
	id: uuid().primaryKey().notNull(),
	status: text(),
	createdAt: timestamp("created_at", { mode: 'string' }),
	updatedAt: timestamp("updated_at", { mode: 'string' }),
});

export const categories = pgTable("categories", {
	id: serial().primaryKey().notNull(),
	slug: text(),
	name: text(),
	description: text(),
	cfImageId: text("cf_image_id"),
	cfAlt: text("cf_alt"),
	sortOrder: integer("sort_order"),
	createdAt: timestamp("created_at", { mode: 'string' }),
	updatedAt: timestamp("updated_at", { mode: 'string' }),
});

export const emailEvents = pgTable("email_events", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	provider: text().default('resend').notNull(),
	eventId: text("event_id"),
	eventType: text("event_type").notNull(),
	emailId: text("email_id"),
	messageId: text("message_id"),
	subject: text(),
	fromAddress: text("from_address"),
	toCsv: text("to_csv"),
	occurredAt: timestamp("occurred_at", { withTimezone: true, mode: 'string' }),
	emailCreatedAt: timestamp("email_created_at", { withTimezone: true, mode: 'string' }),
	clickIp: text("click_ip"),
	clickLink: text("click_link"),
	clickTimestamp: timestamp("click_timestamp", { withTimezone: true, mode: 'string' }),
	clickUserAgent: text("click_user_agent"),
	errorCode: text("error_code"),
	errorMessage: text("error_message"),
	idempotencyKey: text("idempotency_key"),
	raw: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("email_events_email_id_idx").using("btree", table.emailId.asc().nullsLast().op("text_ops")),
	index("email_events_message_id_idx").using("btree", table.messageId.asc().nullsLast().op("text_ops")),
	index("email_events_subject_idx").using("btree", table.subject.asc().nullsLast().op("text_ops")),
	index("email_events_to_idx").using("btree", table.toCsv.asc().nullsLast().op("text_ops")),
	index("email_events_type_idx").using("btree", table.eventType.asc().nullsLast().op("text_ops")),
	index("email_events_when_idx").using("btree", table.occurredAt.asc().nullsLast().op("timestamptz_ops")),
]);

export const images = pgTable("images", {
	id: serial().primaryKey().notNull(),
	ownerType: text("owner_type"),
	ownerId: integer("owner_id"),
	variant: text(),
	cfImageId: text("cf_image_id"),
	url: text(),
	alt: text(),
	sortOrder: integer("sort_order"),
	createdAt: timestamp("created_at", { mode: 'string' }),
	updatedAt: timestamp("updated_at", { mode: 'string' }),
});

export const orders = pgTable("orders", {
	id: uuid().primaryKey().notNull(),
	cartId: uuid("cart_id"),
	stripePaymentIntentId: text("stripe_payment_intent_id"),
	amountCents: integer("amount_cents"),
	currency: text(),
	status: text(),
	createdAt: timestamp("created_at", { mode: 'string' }),
	updatedAt: timestamp("updated_at", { mode: 'string' }),
});

export const products = pgTable("products", {
	id: serial().primaryKey().notNull(),
	subcategoryId: integer("subcategory_id"),
	sku: text(),
	name: text(),
	description: text(),
	imageUrl: text("image_url"),
	cfImageId: text("cf_image_id"),
	cfAlt: text("cf_alt"),
	priceCents: integer("price_cents"),
	msrpCents: integer("msrp_cents"),
	inventory: integer(),
	inStock: boolean("in_stock"),
	sortOrder: integer("sort_order"),
	createdAt: timestamp("created_at", { mode: 'string' }),
	updatedAt: timestamp("updated_at", { mode: 'string' }),
});

export const subcategories = pgTable("subcategories", {
	id: serial().primaryKey().notNull(),
	categoryId: integer("category_id"),
	slug: text(),
	name: text(),
	description: text(),
	cfImageId: text("cf_image_id"),
	cfAlt: text("cf_alt"),
	sortOrder: integer("sort_order"),
	createdAt: timestamp("created_at", { mode: 'string' }),
	updatedAt: timestamp("updated_at", { mode: 'string' }),
});

export const supportMessages = pgTable("support_messages", {
	ticketId: text("ticket_id").primaryKey().notNull(),
	name: text(),
	email: text().notNull(),
	subject: text().notNull(),
	message: text().notNull(),
	ip: text(),
	userAgent: text("user_agent"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const tcgCardPricesCardmarketHistory = pgTable("tcg_card_prices_cardmarket_history", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	cardId: text("card_id").notNull(),
	capturedAt: timestamp("captured_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true, mode: 'string' }),
	averageSellPrice: numeric("average_sell_price", { precision: 12, scale:  2 }),
	lowPrice: numeric("low_price", { precision: 12, scale:  2 }),
	trendPrice: numeric("trend_price", { precision: 12, scale:  2 }),
	germanProLow: numeric("german_pro_low", { precision: 12, scale:  2 }),
	suggestedPrice: numeric("suggested_price", { precision: 12, scale:  2 }),
	reverseHoloSell: numeric("reverse_holo_sell", { precision: 12, scale:  2 }),
	reverseHoloLow: numeric("reverse_holo_low", { precision: 12, scale:  2 }),
	reverseHoloTrend: numeric("reverse_holo_trend", { precision: 12, scale:  2 }),
	lowPriceExPlus: numeric("low_price_ex_plus", { precision: 12, scale:  2 }),
	avg1: numeric({ precision: 12, scale:  2 }),
	avg7: numeric({ precision: 12, scale:  2 }),
	avg30: numeric({ precision: 12, scale:  2 }),
	reverseHoloAvg1: numeric("reverse_holo_avg1", { precision: 12, scale:  2 }),
	reverseHoloAvg7: numeric("reverse_holo_avg7", { precision: 12, scale:  2 }),
	reverseHoloAvg30: numeric("reverse_holo_avg30", { precision: 12, scale:  2 }),
});

export const tcgCardPricesTcgplayerHistory = pgTable("tcg_card_prices_tcgplayer_history", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	cardId: text("card_id").notNull(),
	capturedAt: timestamp("captured_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true, mode: 'string' }),
	currency: text(),
	normal: numeric({ precision: 12, scale:  2 }),
	holofoil: numeric({ precision: 12, scale:  2 }),
	reverseHolofoil: numeric("reverse_holofoil", { precision: 12, scale:  2 }),
	firstEditionHolofoil: numeric("first_edition_holofoil", { precision: 12, scale:  2 }),
	firstEditionNormal: numeric("first_edition_normal", { precision: 12, scale:  2 }),
});

export const tcgCardAbilities = pgTable("tcg_card_abilities", {
	cardId: text("card_id").notNull(),
	name: text(),
	text: text(),
	type: text(),
	slot: text(),
});

export const tcgCardAttacks = pgTable("tcg_card_attacks", {
	cardId: text("card_id").notNull(),
	slot: text(),
	name: text(),
	text: text(),
	damage: text(),
	convertedEnergyCost: text("converted_energy_cost"),
	cost: text(),
});

export const tcgCardImages = pgTable("tcg_card_images", {
	cardId: text("card_id").notNull(),
	small: text(),
	large: text(),
	source: text(),
});

export const tcgCardLegalities = pgTable("tcg_card_legalities", {
	cardId: text("card_id").notNull(),
	format: text(),
	legality: text(),
});

export const tcgCardPricesCardmarket = pgTable("tcg_card_prices_cardmarket", {
	cardId: text("card_id").notNull(),
	url: text(),
	updatedAt: text("updated_at"),
	averageSellPrice: text("average_sell_price"),
	lowPrice: text("low_price"),
	trendPrice: text("trend_price"),
	germanProLow: text("german_pro_low"),
	suggestedPrice: text("suggested_price"),
	reverseHoloSell: text("reverse_holo_sell"),
	reverseHoloLow: text("reverse_holo_low"),
	reverseHoloTrend: text("reverse_holo_trend"),
	lowPriceExPlus: text("low_price_ex_plus"),
	avg1: text(),
	avg7: text(),
	avg30: text(),
	reverseHoloAvg1: text("reverse_holo_avg1"),
	reverseHoloAvg7: text("reverse_holo_avg7"),
	reverseHoloAvg30: text("reverse_holo_avg30"),
});

export const tcgCardPricesTcgplayer = pgTable("tcg_card_prices_tcgplayer", {
	cardId: text("card_id").notNull(),
	url: text(),
	updatedAt: text("updated_at"),
	normal: text(),
	holofoil: text(),
	reverseHolofoil: text("reverse_holofoil"),
	firstEditionHolofoil: text("first_edition_holofoil"),
	firstEditionNormal: text("first_edition_normal"),
	currency: text(),
});

export const tcgCardResistances = pgTable("tcg_card_resistances", {
	cardId: text("card_id").notNull(),
	type: text(),
	value: text(),
	slot: text(),
});

export const tcgCardWeaknesses = pgTable("tcg_card_weaknesses", {
	cardId: text("card_id").notNull(),
	type: text(),
	value: text(),
	slot: text(),
});

export const tcgCards = pgTable("tcg_cards", {
	id: text().primaryKey().notNull(),
	name: text(),
	supertype: text(),
	subtypes: text(),
	level: text(),
	hp: text(),
	types: text(),
	evolvesFrom: text("evolves_from"),
	evolvesTo: text("evolves_to"),
	rules: text(),
	ancientTraitName: text("ancient_trait_name"),
	ancientTraitText: text("ancient_trait_text"),
	convertedRetreatCost: text("converted_retreat_cost"),
	retreatCost: text("retreat_cost"),
	setId: text("set_id"),
	setName: text("set_name"),
	series: text(),
	printedTotal: text("printed_total"),
	total: text(),
	ptcgoCode: text("ptcgo_code"),
	releaseDate: text("release_date"),
	setUpdatedAt: text("set_updated_at"),
	symbolUrl: text("symbol_url"),
	logoUrl: text("logo_url"),
	regulationMark: text("regulation_mark"),
	artist: text(),
	rarity: text(),
	flavorText: text("flavor_text"),
	nationalPokedexNumbers: text("national_pokedex_numbers"),
	extra: text(),
	smallImage: text("small_image"),
	largeImage: text("large_image"),
	tcgplayerUrl: text("tcgplayer_url"),
	tcgplayerUpdatedAt: text("tcgplayer_updated_at"),
	cardmarketUrl: text("cardmarket_url"),
	cardmarketUpdatedAt: text("cardmarket_updated_at"),
});

export const tcgSets = pgTable("tcg_sets", {
	id: text().primaryKey().notNull(),
	name: text(),
	series: text(),
	printedTotal: text("printed_total"),
	total: text(),
	ptcgoCode: text("ptcgo_code"),
	releaseDate: text("release_date"),
	updatedAt: text("updated_at"),
	symbolUrl: text("symbol_url"),
	logoUrl: text("logo_url"),
	standard: text(),
	expanded: text(),
	unlimited: text(),
});

export const tcgSetsLegalities = pgTable("tcg_sets_legalities", {
	setId: text("set_id"),
	format: text(),
	legality: text(),
});

export const tcgTypes = pgTable("tcg_types", {
	name: text(),
});

export const ygoCardPrices = pgTable("ygo_card_prices", {
	cardId: text("card_id").primaryKey().notNull(),
	amazonPrice: numeric("amazon_price", { precision: 12, scale:  2 }),
	cardmarketPrice: numeric("cardmarket_price", { precision: 12, scale:  2 }),
	tcgplayerPrice: numeric("tcgplayer_price", { precision: 12, scale:  2 }),
	ebayPrice: numeric("ebay_price", { precision: 12, scale:  2 }),
	coolstuffincPrice: numeric("coolstuffinc_price", { precision: 12, scale:  2 }),
}, (table) => [
	foreignKey({
			columns: [table.cardId],
			foreignColumns: [ygoCards.cardId],
			name: "ygo_card_prices_card_id_ygo_cards_card_id_fk"
		}).onDelete("cascade"),
]);

export const ygoCardPricesHistory = pgTable("ygo_card_prices_history", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().notNull(),
	cardId: text("card_id").notNull(),
	capturedAt: timestamp("captured_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true, mode: 'string' }),
	tcgplayerPrice: numeric("tcgplayer_price", { precision: 12, scale:  2 }),
	cardmarketPrice: numeric("cardmarket_price", { precision: 12, scale:  2 }),
	ebayPrice: numeric("ebay_price", { precision: 12, scale:  2 }),
	amazonPrice: numeric("amazon_price", { precision: 12, scale:  2 }),
	coolstuffincPrice: numeric("coolstuffinc_price", { precision: 12, scale:  2 }),
}, (table) => [
	foreignKey({
			columns: [table.cardId],
			foreignColumns: [ygoCards.cardId],
			name: "ygo_card_prices_history_card_id_ygo_cards_card_id_fk"
		}).onDelete("cascade"),
]);

export const tcgSubtypes = pgTable("tcg_subtypes", {
	name: text(),
});

export const ygoCards = pgTable("ygo_cards", {
	cardId: text("card_id").primaryKey().notNull(),
	name: text().notNull(),
	type: text(),
	desc: text(),
	atk: integer(),
	def: integer(),
	level: integer(),
	race: text(),
	attribute: text(),
	archetype: text(),
	ygoprodeckUrl: text("ygoprodeck_url"),
	linkval: integer(),
	scale: integer(),
	linkmarkers: text().array(),
	hasEffect: boolean("has_effect"),
	staple: boolean(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const ygoRawDump = pgTable("ygo_raw_dump", {
	id: text().default('cardinfo_v7').primaryKey().notNull(),
	fetchedAt: timestamp("fetched_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	payload: jsonb().notNull(),
});

export const ygoCardBanlist = pgTable("ygo_card_banlist", {
	cardId: text("card_id").primaryKey().notNull(),
	banTcg: text("ban_tcg"),
	banOcg: text("ban_ocg"),
	banGoat: text("ban_goat"),
}, (table) => [
	foreignKey({
			columns: [table.cardId],
			foreignColumns: [ygoCards.cardId],
			name: "ygo_card_banlist_card_id_ygo_cards_card_id_fk"
		}).onDelete("cascade"),
]);

export const scryfallCatalogValues = pgTable("scryfall_catalog_values", {
	catalogKey: text("catalog_key").notNull(),
	value: text().notNull(),
	fetchedAt: timestamp("fetched_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_scryfall_catalog_values_value").using("btree", table.value.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.catalogKey],
			foreignColumns: [scryfallCatalogs.key],
			name: "scryfall_catalog_values_catalog_key_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
	primaryKey({ columns: [table.catalogKey, table.value], name: "scryfall_catalog_values_pkey"}),
]);

export const ygoCardImages = pgTable("ygo_card_images", {
	cardId: text("card_id").notNull(),
	imageUrl: text("image_url").notNull(),
	imageUrlSmall: text("image_url_small"),
	imageId: text("image_id"),
}, (table) => [
	foreignKey({
			columns: [table.cardId],
			foreignColumns: [ygoCards.cardId],
			name: "ygo_card_images_card_id_ygo_cards_card_id_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.cardId, table.imageUrl], name: "ygo_card_images_pkey"}),
]);

export const ygoCardSets = pgTable("ygo_card_sets", {
	cardId: text("card_id").notNull(),
	setName: text("set_name"),
	setCode: text("set_code").notNull(),
	setRarity: text("set_rarity"),
	setRarityCode: text("set_rarity_code"),
	setPrice: numeric("set_price", { precision: 12, scale:  2 }),
}, (table) => [
	foreignKey({
			columns: [table.cardId],
			foreignColumns: [ygoCards.cardId],
			name: "ygo_card_sets_card_id_ygo_cards_card_id_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.cardId, table.setCode], name: "ygo_card_sets_card_id_set_code_pk"}),
]);

export const marketItemExternalIds = pgTable("market_item_external_ids", {
	marketItemId: uuid("market_item_id").notNull(),
	source: text().notNull(),
	externalId: text("external_id").notNull(),
	externalUrl: text("external_url"),
	meta: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_market_item_external_ids_item").using("btree", table.marketItemId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.marketItemId],
			foreignColumns: [marketItems.id],
			name: "market_item_external_ids_market_item_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.source, table.externalId], name: "market_item_external_ids_pkey"}),
]);

export const cardAffiliateLinks = pgTable("card_affiliate_links", {
	category: text().notNull(),
	cardId: text("card_id").notNull(),
	marketplace: text().notNull(),
	url: text().notNull(),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_card_affiliate_links_lookup").using("btree", table.category.asc().nullsLast().op("text_ops"), table.cardId.asc().nullsLast().op("text_ops"), table.marketplace.asc().nullsLast().op("text_ops")),
	primaryKey({ columns: [table.category, table.cardId, table.marketplace], name: "card_affiliate_links_pkey"}),
]);

export const scryfallRulings = pgTable("scryfall_rulings", {
	oracleId: uuid("oracle_id").notNull(),
	source: text().notNull(),
	publishedAt: date("published_at").notNull(),
	comment: text().notNull(),
	commentSha256: text("comment_sha256").notNull(),
	fetchedAt: timestamp("fetched_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_scryfall_rulings_oracle_id").using("btree", table.oracleId.asc().nullsLast().op("uuid_ops")),
	index("idx_scryfall_rulings_published_at").using("btree", table.publishedAt.asc().nullsLast().op("date_ops")),
	index("idx_scryfall_rulings_source").using("btree", table.source.asc().nullsLast().op("text_ops")),
	primaryKey({ columns: [table.oracleId, table.source, table.publishedAt, table.commentSha256], name: "scryfall_rulings_pkey"}),
]);

export const marketPriceDaily = pgTable("market_price_daily", {
	marketItemId: uuid("market_item_id").notNull(),
	asOfDate: date("as_of_date").notNull(),
	currency: text().default('USD').notNull(),
	valueCents: integer("value_cents").notNull(),
	confidence: integer(),
	sourcesUsed: jsonb("sources_used"),
	method: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_market_price_daily_item_date").using("btree", table.marketItemId.asc().nullsLast().op("uuid_ops"), table.asOfDate.asc().nullsLast().op("date_ops")),
	index("idx_mpd_date_currency").using("btree", table.asOfDate.asc().nullsLast().op("date_ops"), table.currency.asc().nullsLast().op("text_ops")),
	index("idx_mpd_item_currency_date").using("btree", table.marketItemId.asc().nullsLast().op("date_ops"), table.currency.asc().nullsLast().op("text_ops"), table.asOfDate.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.marketItemId],
			foreignColumns: [marketItems.id],
			name: "market_price_daily_market_item_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.marketItemId, table.asOfDate, table.currency], name: "market_price_daily_pkey"}),
]);

export const tcgVendorPrices = pgTable("tcg_vendor_prices", {
	game: text().notNull(),
	cardId: text("card_id").notNull(),
	vendor: text().notNull(),
	metric: text().default('market').notNull(),
	currency: text().notNull(),
	value: numeric(),
	url: text(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	meta: jsonb(),
}, (table) => [
	primaryKey({ columns: [table.game, table.cardId, table.vendor], name: "tcg_vendor_prices_game_card_id_vendor_pk"}),
]);

export const tcgVendorMaps = pgTable("tcg_vendor_maps", {
	category: varchar({ length: 16 }).notNull(),
	game: text().notNull(),
	cardId: text("card_id").notNull(),
	vendor: text().notNull(),
	ident: text(),
	currency: varchar({ length: 3 }).default('USD').notNull(),
	value: numeric({ precision: 12, scale:  2 }),
	query: text(),
	urlHint: text("url_hint"),
	url: text(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	primaryKey({ columns: [table.category, table.cardId, table.vendor], name: "tcg_vendor_maps_category_card_id_vendor_pk"}),
]);

export const marketPriceSnapshots = pgTable("market_price_snapshots", {
	marketItemId: uuid("market_item_id").notNull(),
	source: text().notNull(),
	asOfDate: date("as_of_date").notNull(),
	currency: text().default('USD').notNull(),
	priceType: text("price_type").notNull(),
	condition: text(),
	conditionKey: text("condition_key").notNull().generatedAlwaysAs(sql`COALESCE(condition, ''::text)`),
	valueCents: integer("value_cents").notNull(),
	sampleSize: integer("sample_size"),
	confidence: integer(),
	raw: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_market_price_snapshots_item_date").using("btree", table.marketItemId.asc().nullsLast().op("uuid_ops"), table.asOfDate.asc().nullsLast().op("date_ops")),
	index("idx_mps_currency_date_item").using("btree", table.currency.asc().nullsLast().op("uuid_ops"), table.asOfDate.desc().nullsFirst().op("text_ops"), table.marketItemId.asc().nullsLast().op("date_ops")),
	index("idx_mps_item_currency_date").using("btree", table.marketItemId.asc().nullsLast().op("date_ops"), table.currency.asc().nullsLast().op("uuid_ops"), table.asOfDate.desc().nullsFirst().op("date_ops")),
	uniqueIndex("uq_market_price_snapshots").using("btree", sql`market_item_id`, sql`source`, sql`as_of_date`, sql`currency`, sql`price_type`, sql`COALESCE(condition, ''::text)`),
	foreignKey({
			columns: [table.marketItemId],
			foreignColumns: [marketItems.id],
			name: "market_price_snapshots_market_item_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.marketItemId, table.source, table.asOfDate, table.currency, table.priceType, table.conditionKey], name: "market_price_snapshots_pkey"}),
]);

export const userCollectionDailyValuations = pgTable("user_collection_daily_valuations", {
	userId: text("user_id").notNull(),
	asOfDate: date("as_of_date").notNull(),
	totalValueCents: integer("total_value_cents").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	id: uuid().defaultRandom(),
	totalQuantity: integer("total_quantity").default(0).notNull(),
	distinctItems: integer("distinct_items").default(0).notNull(),
	totalCostCents: integer("total_cost_cents").default(0).notNull(),
	realizedPnlCents: integer("realized_pnl_cents"),
	unrealizedPnlCents: integer("unrealized_pnl_cents"),
	breakdown: jsonb().default({}).notNull(),
}, (table) => [
	index("idx_user_collection_daily_valuations_user").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	uniqueIndex("ux_user_collection_daily_valuations_id").using("btree", table.id.asc().nullsLast().op("uuid_ops")),
	primaryKey({ columns: [table.userId, table.asOfDate], name: "user_collection_daily_valuations_pkey"}),
]);

export const pricechartingPricesRaw = pgTable("pricecharting_prices_raw", {
	game: text().notNull(),
	pricechartingId: text("pricecharting_id").notNull(),
	productName: text("product_name").notNull(),
	consoleName: text("console_name"),
	loosePriceCents: integer("loose_price_cents"),
	cibPriceCents: integer("cib_price_cents"),
	newPriceCents: integer("new_price_cents"),
	gradedPriceCents: integer("graded_price_cents"),
	boxOnlyPriceCents: integer("box_only_price_cents"),
	manualOnlyPriceCents: integer("manual_only_price_cents"),
	bgs10PriceCents: integer("bgs_10_price_cents"),
	cgc10PriceCents: integer("cgc_10_price_cents"),
	psa10PriceCents: integer("psa_10_price_cents"),
	releaseDate: date("release_date"),
	sourceDate: date("source_date").notNull(),
	raw: jsonb().default({}).notNull(),
	importedAt: timestamp("imported_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_pc_raw_game_date").using("btree", table.game.asc().nullsLast().op("date_ops"), table.sourceDate.asc().nullsLast().op("text_ops")),
	index("idx_pc_raw_name").using("btree", table.game.asc().nullsLast().op("text_ops"), table.productName.asc().nullsLast().op("text_ops")),
	primaryKey({ columns: [table.game, table.pricechartingId, table.sourceDate], name: "pricecharting_prices_raw_pkey"}),
]);
