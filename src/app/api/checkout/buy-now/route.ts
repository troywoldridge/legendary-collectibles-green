// src/app/api/checkout/buy-now/route.ts
import "server-only";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema/shop";
import { eq } from "drizzle-orm";
import Stripe from "stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

function s(v: unknown) {
  return String(v ?? "").trim();
}

function getStripe() {
  const key = s(process.env.STRIPE_SECRET_KEY);
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(key, { apiVersion: "2025-10-29.clover" });
}

function getOrigin(req: Request) {
  const fromEnv = s(
    process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.SITE_URL ||
      process.env.APP_URL
  ).replace(/\/+$/, "");
  if (fromEnv) return fromEnv;

  const h = req.headers;
  const proto = s(h.get("x-forwarded-proto")) || "https";
  const host = s(h.get("x-forwarded-host") || h.get("host"));
  if (host) return `${proto}://${host}`.replace(/\/+$/, "");

  const origin = s(h.get("origin"));
  return origin ? origin.replace(/\/+$/, "") : "https://legendary-collectibles.com";
}

export async function POST(req: Request) {
  try {
    const stripe = getStripe();

    const body = (await req.json().catch(() => ({}))) as any;
    const productId = s(body?.productId);
    const qty = Math.max(1, Math.min(99, Number(body?.quantity) || 1));

    if (!productId) {
      return NextResponse.json({ error: "Missing productId" }, { status: 400 });
    }

    const row = await db
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    if (!row.length) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const p: any = row[0];

    if (p.status !== "active") {
      return NextResponse.json({ error: "Not available" }, { status: 400 });
    }

    if (Number(p.quantity ?? 0) < qty) {
      return NextResponse.json({ error: "Out of stock" }, { status: 400 });
    }

    const origin = getOrigin(req);

    const unitAmount = Number(p.priceCents ?? p.price_cents ?? 0);
    if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
      return NextResponse.json({ error: "Invalid price" }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${origin}/cart?success=1`,
      cancel_url: `${origin}/products/${p.id}`,

      // ✅ Make webhook life easy:
      metadata: {
        source: "buy_now",
        productId: String(p.id),
        quantity: String(qty),
      },

      line_items: [
        {
          quantity: qty,
          price_data: {
            currency: "usd",
            unit_amount: unitAmount,
            product_data: {
              name: String(p.title || "Item"),
              metadata: { productId: String(p.id) },
            },
          },
        },
      ],
    });

    return NextResponse.json({ url: session.url ?? null }, { status: 200 });
  } catch (err: any) {
    console.error("[api/checkout/buy-now] error", err);
    const msg = s(err?.message || err) || "Checkout failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
