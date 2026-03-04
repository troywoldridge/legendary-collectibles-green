import "server-only";

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ------------------------- Env ------------------------- */
const STRIPE_SECRET_KEY =
  process.env.STRIPE_SECRET_KEY ??
  (() => {
    throw new Error("Missing STRIPE_SECRET_KEY");
  })();

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.SITE_URL ||
  "https://legendary-collectibles.com"
).replace(/\/+$/, "");

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2025-10-29.clover",
});

/* ------------------------- Helpers ------------------------- */
function s(v: unknown) {
  return String(v ?? "").trim();
}

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function currencyForGame(game: string | null): string {
  // If your store is always USD, keep USD.
  // If you eventually run CAD too, you can key this off store / locale.
  return "usd";
}

/* ------------------------- Route ------------------------- */
export async function GET(req: Request) {
  const url = new URL(req.url);

  const itemId = s(url.searchParams.get("item_id"));
  const qty = clampInt(Number(s(url.searchParams.get("qty")) || "1") || 1, 1, 25);

  // If Google hits without id, just send somewhere safe
  if (!itemId) {
    return NextResponse.redirect(new URL("/cart", SITE_URL), 302);
  }

  // Your feed uses UUIDs as ids. If it isn't, fall back to product page.
  if (!isUuid(itemId)) {
    return NextResponse.redirect(new URL(`/products/${encodeURIComponent(itemId)}`, SITE_URL), 302);
  }

  // Pull product (price + title + slug) from your products table
  const product =
    (
      await db.execute<{
        id: string;
        title: string | null;
        slug: string | null;
        game: string | null;
        price_cents: number | null;
        status: string | null;
        quantity: number | null;
        inventory_type: string | null;
      }>(sql`
        SELECT
          id::text AS id,
          NULLIF(title,'') AS title,
          NULLIF(slug,'') AS slug,
          NULLIF(game,'') AS game,
          price_cents::int AS price_cents,
          NULLIF(status,'') AS status,
          quantity::int AS quantity,
          NULLIF(inventory_type,'') AS inventory_type
        FROM public.products
        WHERE id::text = ${itemId}::text
        LIMIT 1
      `)
    ).rows?.[0] ?? null;

  // If product isn't found, send to your storefront search
  if (!product) {
    return NextResponse.redirect(new URL(`/search?q=${encodeURIComponent(itemId)}`, SITE_URL), 302);
  }

  // Prefer slug URL if available
  const productUrlPath = product.slug ? `/products/${encodeURIComponent(product.slug)}` : `/products/${encodeURIComponent(product.id)}`;
  const productUrl = new URL(productUrlPath, SITE_URL);

  // Basic purchase eligibility checks (tweak to your taste)
  const isActive = (product.status || "").toLowerCase() === "active";
  const inStock =
    (product.inventory_type || "").toLowerCase() !== "stock" ||
    (product.quantity != null && product.quantity > 0);

  const unitAmount = Number(product.price_cents ?? 0);

  // If something is off, just send to product page rather than erroring
  if (!isActive || !inStock || !Number.isFinite(unitAmount) || unitAmount <= 0) {
    return NextResponse.redirect(productUrl, 302);
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: qty,
          price_data: {
            currency: currencyForGame(product.game || null),
            unit_amount: unitAmount,
            product_data: {
              name: product.title || "Item",
            },
          },
        },
      ],

      // These are NOT what Google is asking for — but Stripe requires them.
      // Keep them stable and safe.
      success_url: `${SITE_URL}/account/orders?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}${productUrlPath}?checkout=cancel`,

      metadata: {
        source: "google_merchant_checkout_url",
        product_id: product.id,
      },
    });

    if (session.url) return NextResponse.redirect(session.url, 303);

    return NextResponse.redirect(productUrl, 302);
  } catch {
    return NextResponse.redirect(productUrl, 302);
  }
}