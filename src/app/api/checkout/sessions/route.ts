// src/app/api/checkout/session/route.ts
import "server-only";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: unknown): string {
  return String(v ?? "");
}
function n(v: unknown, fallback = 0): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

const STRIPE_SECRET_KEY = s(process.env.STRIPE_SECRET_KEY).trim();

const SITE_URL = s(
  process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    "https://legendary-collectibles.com",
)
  .trim()
  .replace(/\/+$/, "");

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2025-10-29.clover",
});

type CartRow = { id: string };

type LineRow = {
  qty: number;
  title: string;
  priceCents: number;
  imageUrl: string | null;
  slug: string | null;
};

export async function POST() {
  try {
    if (!STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "Stripe not configured (missing STRIPE_SECRET_KEY)" },
        { status: 500 },
      );
    }

    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1) active cart
    const cartRes = await db.execute<CartRow>(sql`
      select id
      from carts
      where user_id = ${userId}
        and coalesce(status, 'open') = 'open'
      order by updated_at desc nulls last, created_at desc
      limit 1
    `);

    const cartId = s(cartRes.rows?.[0]?.id).trim();
    if (!cartId) {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
    }

    // 2) purchasable lines: cart_lines.listing_id -> products.id
    const linesRes = await db.execute<LineRow>(sql`
      select
        cl.qty as "qty",
        p.title as "title",
        p.price_cents as "priceCents",
        p.image_url as "imageUrl",
        p.slug as "slug"
      from cart_lines cl
      join products p on p.id = cl.listing_id
      where cl.cart_id = ${cartId}
        and cl.listing_id is not null
        and p.price_cents is not null
        and p.price_cents > 0
      order by cl.id asc
    `);

    const rows = linesRes.rows ?? [];
    if (!rows.length) {
      return NextResponse.json(
        { error: "No purchasable items in cart" },
        { status: 400 },
      );
    }

    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = rows.map(
      (r) => {
        const qty = Math.max(1, n(r.qty, 1));
        const unitAmount = Math.max(1, n(r.priceCents, 0));

        const title = s(r.title).trim() || "Item";

        const product_data: Stripe.Checkout.SessionCreateParams.LineItem.PriceData.ProductData =
          { name: title };

        const rawImg = s(r.imageUrl).trim();
        if (rawImg) {
          const isAbs = /^https?:\/\//i.test(rawImg);
          const abs = isAbs
            ? rawImg
            : `${SITE_URL}${rawImg.startsWith("/") ? "" : "/"}${rawImg}`;

          product_data.images = [abs];
        }

        return {
          quantity: qty,
          price_data: {
            currency: "usd",
            unit_amount: unitAmount,
            product_data,
          },
        };
      },
    );

    // 3) create Stripe checkout session
   const session = await stripe.checkout.sessions.create({
  mode: "payment",
  line_items,
  success_url: `${SITE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${SITE_URL}/cart`,
  metadata: {
    cart_id: String(cartId),
    user_id: String(userId),
  },
});

// ✅ Always return sessionId (url is optional)
return NextResponse.json(
  {
    sessionId: session.id,
    url: session.url ?? null,
  },
  { status: 200 },
);


    return NextResponse.json({ URL }, { status: 200 });
  } catch (err: any) {
    console.error("[api/checkout/session] error", err);
    return NextResponse.json(
      { error: s(err?.message || err) || "Internal Server Error" },
      { status: 500 },
    );
  }
}
