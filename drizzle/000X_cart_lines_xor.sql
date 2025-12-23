ALTER TABLE cart_lines
ADD CONSTRAINT cart_lines_one_item_ref_chk
CHECK (
  (product_id IS NOT NULL AND listing_id IS NULL)
  OR
  (product_id IS NULL AND listing_id IS NOT NULL)
);
