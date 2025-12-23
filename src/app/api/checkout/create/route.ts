// src/app/api/checkout/create/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: '2025-10-29.clover',
});

export async function POST() {
  const { userId } = await auth();

  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

  // Load cart
  const cartRes = await db.execute<{ id: string }>(sql`
    SELECT id
    FROM public.carts
    WHERE user_id = ${userId}
    LIMIT 1
  `);

  const cartId = cartRes.rows?.[0]?.id;
  if (!cartId) return NextResponse.json({ error: "Cart is empty" }, { status: 400 });

  // Load listing lines (authoritative)
  const itemsRes = await db.execute<{
    listing_id: string;
    qty: number;
    title: string | null;
    price_cents: number;
    currency: string;
    status: string | null;
    image_url: string | null;
  }>(sql`
    SELECT
      cl.listing_id,
      cl.qty,
      COALESCE(sl.title, sl.name) AS title,
      sl.price_cents,
      sl.currency,
      sl.status,
      sl.image_url
    FROM public.cart_lines cl
    JOIN public.store_listings sl
      ON sl.id = cl.listing_id
    WHERE cl.cart_id = ${cartId}::uuid
      AND cl.listing_id IS NOT NULL
    ORDER BY cl.id ASC
  `);

  const items = itemsRes.rows ?? [];
  if (!items.length) {
    return NextResponse.json({ error: "Cart has no store items" }, { status: 400 });
  }

  // Validate active
  for (const it of items) {
    if ((it.status ?? "active") !== "active") {
      return NextResponse.json(
        { error: `Listing not active: ${it.listing_id}` },
        { status: 400 },
      );
    }
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: items.map((it) => ({
      quantity: it.qty,
      price_data: {
        currency: (it.currency || "USD").toLowerCase(),
        unit_amount: it.price_cents,
        product_data: {
          name: it.title ?? "Listing",
          // Stripe requires https for images; keep only if valid
          images: it.image_url?.startsWith("http") ? [it.image_url] : undefined,
          metadata: { listing_id: it.listing_id },
        },
      },
    })),

    // shipping: we’ll add calculated options next (v1 stub)
    // For now: require address collection so we can calculate later via webhook/order review
    shipping_address_collection: {
      allowed_countries: ["US", "CA"],
    },

    success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/cart`,
    metadata: {
      user_id: userId,
      cart_id: cartId,
      kind: "store_order",
    },
  });

  return NextResponse.json({ checkoutUrl: session.url });
}
