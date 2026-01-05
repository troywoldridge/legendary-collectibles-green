// src/app/api/stripe/checkout/start/route.ts
import "server-only";

import { NextResponse } from "next/server";
import Stripe from "stripe";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";

function okUrl(u: unknown): u is string {
  return typeof u === "string" && u.length > 0;
}

function absUrl(base: string, maybeRelative: string) {
  if (maybeRelative.startsWith("http://") || maybeRelative.startsWith("https://")) return maybeRelative;
  return `${base}${maybeRelative.startsWith("/") ? "" : "/"}${maybeRelative}`;
}

type CartItem = {
  productId: string;
  qty: number;
  title: string;
  unitPriceCents: number;
  image?: { url: string; alt?: string | null } | null;
};

type CartResponse = {
  cartId: string | null;
  items: CartItem[];
  subtotalCents: number;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (!STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "Stripe misconfigured: missing STRIPE_SECRET_KEY" },
        { status: 500 }
      );
    }

    const origin = (req.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://legendary-collectibles.com")
      .replace(/\/+$/, "");

    // Stripe client
    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      // If your installed stripe version complains about apiVersion, delete this line.
      apiVersion: "2025-10-29.clover",
    });

    // Load cart using the SAME cookie as the browser
    const cartRes = await fetch(`${origin}/api/cart`, {
      method: "GET",
      headers: {
        cookie: req.headers.get("cookie") || "",
      },
      cache: "no-store",
    });

    if (!cartRes.ok) {
      const t = await cartRes.text().catch(() => "");
      return NextResponse.json(
        { error: `Failed to load cart (${cartRes.status})`, detail: t.slice(0, 500) },
        { status: 400 }
      );
    }

    const cart = (await cartRes.json().catch(() => null)) as CartResponse | null;
    const items = Array.isArray(cart?.items) ? cart!.items : [];

    if (!cart?.cartId || items.length === 0) {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
    }

    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = items.map((it) => {
      const name = String(it.title || "Item").slice(0, 250);
      const qty = Math.max(1, Number(it.qty || 1));
      const amount = Math.max(0, Number(it.unitPriceCents || 0));

      const img = it.image?.url ? absUrl(origin, it.image.url) : undefined;

      return {
        quantity: qty,
        price_data: {
          currency: "usd",
          unit_amount: amount,
          product_data: {
            name,
            ...(img ? { images: [img] } : {}),
            metadata: { productId: String(it.productId || "") },
          },
        },
      };
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout/canceled`,
      metadata: { cartId: cart.cartId },
      customer_creation: "if_required",
      billing_address_collection: "auto",
      shipping_address_collection: { allowed_countries: ["US", "CA"] },
    });

    if (!okUrl(session.url)) {
      return NextResponse.json({ error: "Checkout failed: missing Stripe URL" }, { status: 500 });
    }

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err: any) {
    console.error("[api/stripe/checkout/start] error", err);
    return NextResponse.json(
      { error: err?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: "POST to this endpoint to start checkout" }, { status: 200 });
}
