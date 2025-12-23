-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE "market_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game" text NOT NULL,
	"kind" text DEFAULT 'card' NOT NULL,
	"canonical_source" text NOT NULL,
	"canonical_id" text NOT NULL,
	"display_name" text,
	"set_name" text,
	"set_code" text,
	"number" text,
	"image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_items_game_canonical_source_canonical_id_key" UNIQUE("game","canonical_source","canonical_id")
);
--> statement-breakpoint
CREATE TABLE "pricecharting_import_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"game" text NOT NULL,
	"file_name" text,
	"file_sha256" text,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tcg_supertypes" (
	"name" text
);
--> statement-breakpoint
CREATE TABLE "tcg_rarities" (
	"name" text
);
--> statement-breakpoint
CREATE TABLE "market_prices_current" (
	"market_item_id" uuid PRIMARY KEY NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"price_cents" integer NOT NULL,
	"source" text NOT NULL,
	"price_type" text NOT NULL,
	"confidence" text NOT NULL,
	"as_of_date" date NOT NULL,
	"sources_used" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_plans" (
	"user_id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_collection_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"game" text NOT NULL,
	"card_id" text NOT NULL,
	"card_name" text NOT NULL,
	"set_name" text,
	"image_url" text,
	"grading_company" text,
	"grade_label" text,
	"cert_number" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"folder" text,
	"cost_cents" integer,
	"last_value_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"purchase_date" date
);
--> statement-breakpoint
CREATE TABLE "scryfall_card_symbols" (
	"symbol" text PRIMARY KEY NOT NULL,
	"loose_variant" text,
	"english" text NOT NULL,
	"transposable" boolean DEFAULT false NOT NULL,
	"represents_mana" boolean DEFAULT false NOT NULL,
	"mana_value" numeric,
	"appears_in_mana_costs" boolean DEFAULT false NOT NULL,
	"funny" boolean DEFAULT false NOT NULL,
	"colors" text[] DEFAULT '{"RAY"}' NOT NULL,
	"hybrid" boolean DEFAULT false NOT NULL,
	"phyrexian" boolean DEFAULT false NOT NULL,
	"gatherer_alternates" text[],
	"svg_uri" text,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scryfall_sets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"mtgo_code" text,
	"arena_code" text,
	"tcgplayer_id" integer,
	"name" text NOT NULL,
	"set_type" text NOT NULL,
	"released_at" date,
	"block_code" text,
	"block" text,
	"parent_set_code" text,
	"card_count" integer NOT NULL,
	"printed_size" integer,
	"digital" boolean DEFAULT false NOT NULL,
	"foil_only" boolean DEFAULT false NOT NULL,
	"nonfoil_only" boolean DEFAULT false NOT NULL,
	"scryfall_uri" text NOT NULL,
	"uri" text NOT NULL,
	"icon_svg_uri" text,
	"search_uri" text NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scryfall_sets_code_key" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "scryfall_cards_raw" (
	"id" uuid PRIMARY KEY NOT NULL,
	"oracle_id" uuid,
	"lang" text NOT NULL,
	"name" text NOT NULL,
	"layout" text,
	"set_code" text,
	"set_id" uuid,
	"collector_number" text,
	"released_at" date,
	"arena_id" integer,
	"mtgo_id" integer,
	"mtgo_foil_id" integer,
	"tcgplayer_id" integer,
	"tcgplayer_etched_id" integer,
	"cardmarket_id" integer,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scryfall_catalogs" (
	"key" text PRIMARY KEY NOT NULL,
	"endpoint" text NOT NULL,
	"uri" text NOT NULL,
	"total_values" integer NOT NULL,
	"data" text[] DEFAULT '{"RAY"}' NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_collection_item_valuations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"item_id" uuid NOT NULL,
	"as_of_date" date DEFAULT CURRENT_DATE NOT NULL,
	"value_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"source" text,
	"confidence" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_wishlist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"game" text NOT NULL,
	"card_id" text NOT NULL,
	"card_name" text,
	"set_name" text,
	"image_url" text,
	"market_item_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cart_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"cart_id" uuid NOT NULL,
	"product_id" integer NOT NULL,
	"qty" integer NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"status" text,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text,
	"name" text,
	"description" text,
	"cf_image_id" text,
	"cf_alt" text,
	"sort_order" integer,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "email_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'resend' NOT NULL,
	"event_id" text,
	"event_type" text NOT NULL,
	"email_id" text,
	"message_id" text,
	"subject" text,
	"from_address" text,
	"to_csv" text,
	"occurred_at" timestamp with time zone,
	"email_created_at" timestamp with time zone,
	"click_ip" text,
	"click_link" text,
	"click_timestamp" timestamp with time zone,
	"click_user_agent" text,
	"error_code" text,
	"error_message" text,
	"idempotency_key" text,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "images" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_type" text,
	"owner_id" integer,
	"variant" text,
	"cf_image_id" text,
	"url" text,
	"alt" text,
	"sort_order" integer,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cart_id" uuid,
	"stripe_payment_intent_id" text,
	"amount_cents" integer,
	"currency" text,
	"status" text,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"subcategory_id" integer,
	"sku" text,
	"name" text,
	"description" text,
	"image_url" text,
	"cf_image_id" text,
	"cf_alt" text,
	"price_cents" integer,
	"msrp_cents" integer,
	"inventory" integer,
	"in_stock" boolean,
	"sort_order" integer,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "subcategories" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer,
	"slug" text,
	"name" text,
	"description" text,
	"cf_image_id" text,
	"cf_alt" text,
	"sort_order" integer,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "support_messages" (
	"ticket_id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tcg_card_prices_cardmarket_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"card_id" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_updated_at" timestamp with time zone,
	"average_sell_price" numeric(12, 2),
	"low_price" numeric(12, 2),
	"trend_price" numeric(12, 2),
	"german_pro_low" numeric(12, 2),
	"suggested_price" numeric(12, 2),
	"reverse_holo_sell" numeric(12, 2),
	"reverse_holo_low" numeric(12, 2),
	"reverse_holo_trend" numeric(12, 2),
	"low_price_ex_plus" numeric(12, 2),
	"avg1" numeric(12, 2),
	"avg7" numeric(12, 2),
	"avg30" numeric(12, 2),
	"reverse_holo_avg1" numeric(12, 2),
	"reverse_holo_avg7" numeric(12, 2),
	"reverse_holo_avg30" numeric(12, 2)
);
--> statement-breakpoint
CREATE TABLE "tcg_card_prices_tcgplayer_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"card_id" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_updated_at" timestamp with time zone,
	"currency" text,
	"normal" numeric(12, 2),
	"holofoil" numeric(12, 2),
	"reverse_holofoil" numeric(12, 2),
	"first_edition_holofoil" numeric(12, 2),
	"first_edition_normal" numeric(12, 2)
);
--> statement-breakpoint
CREATE TABLE "tcg_card_abilities" (
	"card_id" text NOT NULL,
	"name" text,
	"text" text,
	"type" text,
	"slot" text
);
--> statement-breakpoint
CREATE TABLE "tcg_card_attacks" (
	"card_id" text NOT NULL,
	"slot" text,
	"name" text,
	"text" text,
	"damage" text,
	"converted_energy_cost" text,
	"cost" text
);
--> statement-breakpoint
CREATE TABLE "tcg_card_images" (
	"card_id" text NOT NULL,
	"small" text,
	"large" text,
	"source" text
);
--> statement-breakpoint
CREATE TABLE "tcg_card_legalities" (
	"card_id" text NOT NULL,
	"format" text,
	"legality" text
);
--> statement-breakpoint
CREATE TABLE "tcg_card_prices_cardmarket" (
	"card_id" text NOT NULL,
	"url" text,
	"updated_at" text,
	"average_sell_price" text,
	"low_price" text,
	"trend_price" text,
	"german_pro_low" text,
	"suggested_price" text,
	"reverse_holo_sell" text,
	"reverse_holo_low" text,
	"reverse_holo_trend" text,
	"low_price_ex_plus" text,
	"avg1" text,
	"avg7" text,
	"avg30" text,
	"reverse_holo_avg1" text,
	"reverse_holo_avg7" text,
	"reverse_holo_avg30" text
);
--> statement-breakpoint
CREATE TABLE "tcg_card_prices_tcgplayer" (
	"card_id" text NOT NULL,
	"url" text,
	"updated_at" text,
	"normal" text,
	"holofoil" text,
	"reverse_holofoil" text,
	"first_edition_holofoil" text,
	"first_edition_normal" text,
	"currency" text
);
--> statement-breakpoint
CREATE TABLE "tcg_card_resistances" (
	"card_id" text NOT NULL,
	"type" text,
	"value" text,
	"slot" text
);
--> statement-breakpoint
CREATE TABLE "tcg_card_weaknesses" (
	"card_id" text NOT NULL,
	"type" text,
	"value" text,
	"slot" text
);
--> statement-breakpoint
CREATE TABLE "tcg_cards" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"supertype" text,
	"subtypes" text,
	"level" text,
	"hp" text,
	"types" text,
	"evolves_from" text,
	"evolves_to" text,
	"rules" text,
	"ancient_trait_name" text,
	"ancient_trait_text" text,
	"converted_retreat_cost" text,
	"retreat_cost" text,
	"set_id" text,
	"set_name" text,
	"series" text,
	"printed_total" text,
	"total" text,
	"ptcgo_code" text,
	"release_date" text,
	"set_updated_at" text,
	"symbol_url" text,
	"logo_url" text,
	"regulation_mark" text,
	"artist" text,
	"rarity" text,
	"flavor_text" text,
	"national_pokedex_numbers" text,
	"extra" text,
	"small_image" text,
	"large_image" text,
	"tcgplayer_url" text,
	"tcgplayer_updated_at" text,
	"cardmarket_url" text,
	"cardmarket_updated_at" text
);
--> statement-breakpoint
CREATE TABLE "tcg_sets" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"series" text,
	"printed_total" text,
	"total" text,
	"ptcgo_code" text,
	"release_date" text,
	"updated_at" text,
	"symbol_url" text,
	"logo_url" text,
	"standard" text,
	"expanded" text,
	"unlimited" text
);
--> statement-breakpoint
CREATE TABLE "tcg_sets_legalities" (
	"set_id" text,
	"format" text,
	"legality" text
);
--> statement-breakpoint
CREATE TABLE "tcg_types" (
	"name" text
);
--> statement-breakpoint
CREATE TABLE "ygo_card_prices" (
	"card_id" text PRIMARY KEY NOT NULL,
	"amazon_price" numeric(12, 2),
	"cardmarket_price" numeric(12, 2),
	"tcgplayer_price" numeric(12, 2),
	"ebay_price" numeric(12, 2),
	"coolstuffinc_price" numeric(12, 2)
);
--> statement-breakpoint
CREATE TABLE "ygo_card_prices_history" (
	"id" bigint PRIMARY KEY NOT NULL,
	"card_id" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_updated_at" timestamp with time zone,
	"tcgplayer_price" numeric(12, 2),
	"cardmarket_price" numeric(12, 2),
	"ebay_price" numeric(12, 2),
	"amazon_price" numeric(12, 2),
	"coolstuffinc_price" numeric(12, 2)
);
--> statement-breakpoint
CREATE TABLE "tcg_subtypes" (
	"name" text
);
--> statement-breakpoint
CREATE TABLE "ygo_cards" (
	"card_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text,
	"desc" text,
	"atk" integer,
	"def" integer,
	"level" integer,
	"race" text,
	"attribute" text,
	"archetype" text,
	"ygoprodeck_url" text,
	"linkval" integer,
	"scale" integer,
	"linkmarkers" text[],
	"has_effect" boolean,
	"staple" boolean,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ygo_raw_dump" (
	"id" text PRIMARY KEY DEFAULT 'cardinfo_v7' NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ygo_card_banlist" (
	"card_id" text PRIMARY KEY NOT NULL,
	"ban_tcg" text,
	"ban_ocg" text,
	"ban_goat" text
);
--> statement-breakpoint
CREATE TABLE "scryfall_catalog_values" (
	"catalog_key" text NOT NULL,
	"value" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scryfall_catalog_values_pkey" PRIMARY KEY("catalog_key","value")
);
--> statement-breakpoint
CREATE TABLE "ygo_card_images" (
	"card_id" text NOT NULL,
	"image_url" text NOT NULL,
	"image_url_small" text,
	"image_id" text,
	CONSTRAINT "ygo_card_images_pkey" PRIMARY KEY("card_id","image_url")
);
--> statement-breakpoint
CREATE TABLE "ygo_card_sets" (
	"card_id" text NOT NULL,
	"set_name" text,
	"set_code" text NOT NULL,
	"set_rarity" text,
	"set_rarity_code" text,
	"set_price" numeric(12, 2),
	CONSTRAINT "ygo_card_sets_card_id_set_code_pk" PRIMARY KEY("card_id","set_code")
);
--> statement-breakpoint
CREATE TABLE "market_item_external_ids" (
	"market_item_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"external_url" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_item_external_ids_pkey" PRIMARY KEY("source","external_id")
);
--> statement-breakpoint
CREATE TABLE "card_affiliate_links" (
	"category" text NOT NULL,
	"card_id" text NOT NULL,
	"marketplace" text NOT NULL,
	"url" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_affiliate_links_pkey" PRIMARY KEY("category","card_id","marketplace")
);
--> statement-breakpoint
CREATE TABLE "scryfall_rulings" (
	"oracle_id" uuid NOT NULL,
	"source" text NOT NULL,
	"published_at" date NOT NULL,
	"comment" text NOT NULL,
	"comment_sha256" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scryfall_rulings_pkey" PRIMARY KEY("oracle_id","source","published_at","comment_sha256")
);
--> statement-breakpoint
CREATE TABLE "market_price_daily" (
	"market_item_id" uuid NOT NULL,
	"as_of_date" date NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"value_cents" integer NOT NULL,
	"confidence" integer,
	"sources_used" jsonb,
	"method" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_price_daily_pkey" PRIMARY KEY("market_item_id","as_of_date","currency")
);
--> statement-breakpoint
CREATE TABLE "tcg_vendor_prices" (
	"game" text NOT NULL,
	"card_id" text NOT NULL,
	"vendor" text NOT NULL,
	"metric" text DEFAULT 'market' NOT NULL,
	"currency" text NOT NULL,
	"value" numeric,
	"url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"meta" jsonb,
	CONSTRAINT "tcg_vendor_prices_game_card_id_vendor_pk" PRIMARY KEY("game","card_id","vendor")
);
--> statement-breakpoint
CREATE TABLE "tcg_vendor_maps" (
	"category" varchar(16) NOT NULL,
	"game" text NOT NULL,
	"card_id" text NOT NULL,
	"vendor" text NOT NULL,
	"ident" text,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"value" numeric(12, 2),
	"query" text,
	"url_hint" text,
	"url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tcg_vendor_maps_category_card_id_vendor_pk" PRIMARY KEY("category","card_id","vendor")
);
--> statement-breakpoint
CREATE TABLE "market_price_snapshots" (
	"market_item_id" uuid NOT NULL,
	"source" text NOT NULL,
	"as_of_date" date NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"price_type" text NOT NULL,
	"condition" text,
	"condition_key" text GENERATED ALWAYS AS (COALESCE(condition, ''::text)) STORED NOT NULL,
	"value_cents" integer NOT NULL,
	"sample_size" integer,
	"confidence" integer,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_price_snapshots_pkey" PRIMARY KEY("market_item_id","source","as_of_date","currency","price_type","condition_key")
);
--> statement-breakpoint
CREATE TABLE "user_collection_daily_valuations" (
	"user_id" text NOT NULL,
	"as_of_date" date NOT NULL,
	"total_value_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid DEFAULT gen_random_uuid(),
	"total_quantity" integer DEFAULT 0 NOT NULL,
	"distinct_items" integer DEFAULT 0 NOT NULL,
	"total_cost_cents" integer DEFAULT 0 NOT NULL,
	"realized_pnl_cents" integer,
	"unrealized_pnl_cents" integer,
	"breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "user_collection_daily_valuations_pkey" PRIMARY KEY("user_id","as_of_date")
);
--> statement-breakpoint
CREATE TABLE "pricecharting_prices_raw" (
	"game" text NOT NULL,
	"pricecharting_id" text NOT NULL,
	"product_name" text NOT NULL,
	"console_name" text,
	"loose_price_cents" integer,
	"cib_price_cents" integer,
	"new_price_cents" integer,
	"graded_price_cents" integer,
	"box_only_price_cents" integer,
	"manual_only_price_cents" integer,
	"bgs_10_price_cents" integer,
	"cgc_10_price_cents" integer,
	"psa_10_price_cents" integer,
	"release_date" date,
	"source_date" date NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pricecharting_prices_raw_pkey" PRIMARY KEY("game","pricecharting_id","source_date")
);
--> statement-breakpoint
ALTER TABLE "market_prices_current" ADD CONSTRAINT "market_prices_current_market_item_id_fkey" FOREIGN KEY ("market_item_id") REFERENCES "public"."market_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scryfall_cards_raw" ADD CONSTRAINT "fk_scryfall_cards_set_id" FOREIGN KEY ("set_id") REFERENCES "public"."scryfall_sets"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "user_collection_item_valuations" ADD CONSTRAINT "user_collection_item_valuations_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."user_collection_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_wishlist_items" ADD CONSTRAINT "user_wishlist_items_market_item_id_fkey" FOREIGN KEY ("market_item_id") REFERENCES "public"."market_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ygo_card_prices" ADD CONSTRAINT "ygo_card_prices_card_id_ygo_cards_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."ygo_cards"("card_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ygo_card_prices_history" ADD CONSTRAINT "ygo_card_prices_history_card_id_ygo_cards_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."ygo_cards"("card_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ygo_card_banlist" ADD CONSTRAINT "ygo_card_banlist_card_id_ygo_cards_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."ygo_cards"("card_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scryfall_catalog_values" ADD CONSTRAINT "scryfall_catalog_values_catalog_key_fkey" FOREIGN KEY ("catalog_key") REFERENCES "public"."scryfall_catalogs"("key") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ygo_card_images" ADD CONSTRAINT "ygo_card_images_card_id_ygo_cards_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."ygo_cards"("card_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ygo_card_sets" ADD CONSTRAINT "ygo_card_sets_card_id_ygo_cards_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."ygo_cards"("card_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_item_external_ids" ADD CONSTRAINT "market_item_external_ids_market_item_id_fkey" FOREIGN KEY ("market_item_id") REFERENCES "public"."market_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_price_daily" ADD CONSTRAINT "market_price_daily_market_item_id_fkey" FOREIGN KEY ("market_item_id") REFERENCES "public"."market_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_price_snapshots" ADD CONSTRAINT "market_price_snapshots_market_item_id_fkey" FOREIGN KEY ("market_item_id") REFERENCES "public"."market_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_market_items_game" ON "market_items" USING btree ("game" text_ops);--> statement-breakpoint
CREATE INDEX "idx_mi_lookup" ON "market_items" USING btree ("game" text_ops,"canonical_source" text_ops,"canonical_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_market_prices_current_as_of" ON "market_prices_current" USING btree ("as_of_date" date_ops);--> statement-breakpoint
CREATE INDEX "idx_market_prices_current_item_source" ON "market_prices_current" USING btree ("market_item_id" text_ops,"source" text_ops);--> statement-breakpoint
CREATE INDEX "idx_market_prices_current_source" ON "market_prices_current" USING btree ("source" text_ops);--> statement-breakpoint
CREATE INDEX "idx_mpc_item_currency" ON "market_prices_current" USING btree ("market_item_id" uuid_ops,"currency" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_user_plans_user_id" ON "user_plans" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_user_collection_items_user" ON "user_collection_items" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_user_collection_items_user_folder" ON "user_collection_items" USING btree ("user_id" text_ops,"folder" text_ops);--> statement-breakpoint
CREATE INDEX "idx_user_collection_items_user_game" ON "user_collection_items" USING btree ("user_id" text_ops,"game" text_ops);--> statement-breakpoint
CREATE INDEX "idx_user_collection_items_user_set" ON "user_collection_items" USING btree ("user_id" text_ops,"set_name" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "ux_user_collection_item_identity" ON "user_collection_items" USING btree (user_id text_ops,game text_ops,card_id text_ops,COALESCE(grading_company, ''::text) text_ops,COALESCE(grade_label, ''::text) text_ops,COALESCE(cert_number, ''::text) text_ops,COALESCE(folder, ''::text) text_ops);--> statement-breakpoint
CREATE INDEX "idx_scryfall_symbols_colors" ON "scryfall_card_symbols" USING gin ("colors" array_ops);--> statement-breakpoint
CREATE INDEX "idx_scryfall_symbols_represents_mana" ON "scryfall_card_symbols" USING btree ("represents_mana" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_scryfall_sets_released_at" ON "scryfall_sets" USING btree ("released_at" date_ops);--> statement-breakpoint
CREATE INDEX "idx_scryfall_sets_set_type" ON "scryfall_sets" USING btree ("set_type" text_ops);--> statement-breakpoint
CREATE INDEX "idx_scryfall_sets_tcgplayer_id" ON "scryfall_sets" USING btree ("tcgplayer_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_scryfall_cards_arena_id" ON "scryfall_cards_raw" USING btree ("arena_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_scryfall_cards_cardmarket_id" ON "scryfall_cards_raw" USING btree ("cardmarket_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_scryfall_cards_lang" ON "scryfall_cards_raw" USING btree ("lang" text_ops);--> statement-breakpoint
CREATE INDEX "idx_scryfall_cards_mtgo_foil_id" ON "scryfall_cards_raw" USING btree ("mtgo_foil_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_scryfall_cards_mtgo_id" ON "scryfall_cards_raw" USING btree ("mtgo_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_scryfall_cards_oracle_id" ON "scryfall_cards_raw" USING btree ("oracle_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_scryfall_cards_set_code_num" ON "scryfall_cards_raw" USING btree ("set_code" text_ops,"collector_number" text_ops);--> statement-breakpoint
CREATE INDEX "idx_scryfall_cards_set_id" ON "scryfall_cards_raw" USING btree ("set_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_scryfall_cards_tcgplayer_etched_id" ON "scryfall_cards_raw" USING btree ("tcgplayer_etched_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_scryfall_cards_tcgplayer_id" ON "scryfall_cards_raw" USING btree ("tcgplayer_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_scryfall_catalogs_endpoint" ON "scryfall_catalogs" USING btree ("endpoint" text_ops);--> statement-breakpoint
CREATE INDEX "idx_uc_item_vals_item_date" ON "user_collection_item_valuations" USING btree ("item_id" date_ops,"as_of_date" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_uc_item_vals_user_date" ON "user_collection_item_valuations" USING btree ("user_id" date_ops,"as_of_date" date_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "ux_uc_item_vals_user_item_date_source" ON "user_collection_item_valuations" USING btree (user_id uuid_ops,item_id text_ops,as_of_date uuid_ops,COALESCE(source, ''::text) uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_user_wishlist_user" ON "user_wishlist_items" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_user_wishlist_user_game" ON "user_wishlist_items" USING btree ("user_id" text_ops,"game" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "ux_user_wishlist_user_game_card" ON "user_wishlist_items" USING btree ("user_id" text_ops,"game" text_ops,"card_id" text_ops);--> statement-breakpoint
CREATE INDEX "email_events_email_id_idx" ON "email_events" USING btree ("email_id" text_ops);--> statement-breakpoint
CREATE INDEX "email_events_message_id_idx" ON "email_events" USING btree ("message_id" text_ops);--> statement-breakpoint
CREATE INDEX "email_events_subject_idx" ON "email_events" USING btree ("subject" text_ops);--> statement-breakpoint
CREATE INDEX "email_events_to_idx" ON "email_events" USING btree ("to_csv" text_ops);--> statement-breakpoint
CREATE INDEX "email_events_type_idx" ON "email_events" USING btree ("event_type" text_ops);--> statement-breakpoint
CREATE INDEX "email_events_when_idx" ON "email_events" USING btree ("occurred_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_scryfall_catalog_values_value" ON "scryfall_catalog_values" USING btree ("value" text_ops);--> statement-breakpoint
CREATE INDEX "idx_market_item_external_ids_item" ON "market_item_external_ids" USING btree ("market_item_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_card_affiliate_links_lookup" ON "card_affiliate_links" USING btree ("category" text_ops,"card_id" text_ops,"marketplace" text_ops);--> statement-breakpoint
CREATE INDEX "idx_scryfall_rulings_oracle_id" ON "scryfall_rulings" USING btree ("oracle_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_scryfall_rulings_published_at" ON "scryfall_rulings" USING btree ("published_at" date_ops);--> statement-breakpoint
CREATE INDEX "idx_scryfall_rulings_source" ON "scryfall_rulings" USING btree ("source" text_ops);--> statement-breakpoint
CREATE INDEX "idx_market_price_daily_item_date" ON "market_price_daily" USING btree ("market_item_id" uuid_ops,"as_of_date" date_ops);--> statement-breakpoint
CREATE INDEX "idx_mpd_date_currency" ON "market_price_daily" USING btree ("as_of_date" date_ops,"currency" text_ops);--> statement-breakpoint
CREATE INDEX "idx_mpd_item_currency_date" ON "market_price_daily" USING btree ("market_item_id" date_ops,"currency" text_ops,"as_of_date" text_ops);--> statement-breakpoint
CREATE INDEX "idx_market_price_snapshots_item_date" ON "market_price_snapshots" USING btree ("market_item_id" uuid_ops,"as_of_date" date_ops);--> statement-breakpoint
CREATE INDEX "idx_mps_currency_date_item" ON "market_price_snapshots" USING btree ("currency" uuid_ops,"as_of_date" text_ops,"market_item_id" date_ops);--> statement-breakpoint
CREATE INDEX "idx_mps_item_currency_date" ON "market_price_snapshots" USING btree ("market_item_id" date_ops,"currency" uuid_ops,"as_of_date" date_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_market_price_snapshots" ON "market_price_snapshots" USING btree (market_item_id text_ops,source date_ops,as_of_date uuid_ops,currency date_ops,price_type text_ops,COALESCE(condition, ''::text) uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_user_collection_daily_valuations_user" ON "user_collection_daily_valuations" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "ux_user_collection_daily_valuations_id" ON "user_collection_daily_valuations" USING btree ("id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_pc_raw_game_date" ON "pricecharting_prices_raw" USING btree ("game" date_ops,"source_date" text_ops);--> statement-breakpoint
CREATE INDEX "idx_pc_raw_name" ON "pricecharting_prices_raw" USING btree ("game" text_ops,"product_name" text_ops);
*/