ALTER TABLE "cart_lines" ALTER COLUMN "product_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cart_lines" ADD COLUMN "listing_id" uuid;--> statement-breakpoint
CREATE INDEX "idx_cart_lines_cart_id" ON "cart_lines" USING btree ("cart_id");--> statement-breakpoint
CREATE INDEX "idx_cart_lines_product_id" ON "cart_lines" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_cart_lines_listing_id" ON "cart_lines" USING btree ("listing_id");