CREATE TABLE IF NOT EXISTS public.cart_users (
  user_id text PRIMARY KEY,
  cart_id uuid NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cart_users_cart_id
ON public.cart_users(cart_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_cart_lines_cart_listing
ON public.cart_lines (cart_id, listing_id)
WHERE listing_id IS NOT NULL;
