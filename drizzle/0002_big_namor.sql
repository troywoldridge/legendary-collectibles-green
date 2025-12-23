CREATE TABLE "store_listing_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"url" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"alt" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"game" text NOT NULL,
	"kind" text DEFAULT 'single' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"card_id" text,
	"set_name" text,
	"condition" text,
	"language" text DEFAULT 'EN',
	"grading_company" text,
	"grade_label" text,
	"cert_number" text,
	"price_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"ship_weight_grams" integer DEFAULT 0,
	"ship_meta" jsonb DEFAULT '{}'::jsonb,
	"primary_image_url" text,
	"featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_store_listing_images_listing" ON "store_listing_images" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "idx_store_listings_game" ON "store_listings" USING btree ("game");--> statement-breakpoint
CREATE INDEX "idx_store_listings_status" ON "store_listings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_store_listings_card" ON "store_listings" USING btree ("game","card_id");