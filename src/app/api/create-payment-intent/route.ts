// src/app/api/create-payment-intent/route.ts
import "server-only";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import Stripe from "stripe";

import { db } from "@/lib/db";
import { eq, inArray } from "drizzle-orm";
import { cart_lines } from "@/lib/db/schema/cart";
import { products } from "@/lib/db/schema/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const CART_COOKIE = "lc_cart_id";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function toCents(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

function getStripe() {
  const key = s(process.env.STRIPE_SECRET_KEY);
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key, { apiVersion: "2025-10-29.clover" });
}

export async function POST(req: Request) {
  try {
    const stripe = getStripe();

    const jar = await cookies();
    const cartId = s(jar.get(CART_COOKIE)?.value);

    if (!cartId || !isUuid(cartId)) {
      return json({ error: "No active cart" }, 400);
    }

    // Client may send these (or you can compute them server-side later)
    const body = await req.json().catch(() => null);

    const shippingCents = toCents(body?.shippingCents);
    const taxCents = toCents(body?.taxCents);
    const loyaltyCreditsCents = toCents(body?.loyaltyCreditsCents);

    // Load cart lines
    const lines = await db
      .select({
        id: cart_lines.id,
        productId: cart_lines.listing_id,
        qty: cart_lines.qty,
      })
      .from(cart_lines)
      .where(eq(cart_lines.cart_id, cartId));

    if (!lines.length) return json({ error: "Cart is empty" }, 400);

    const productIds = lines
      .map((l) => l.productId)
      .filter((x): x is string => typeof x === "string" && x.length > 0);

    if (!productIds.length) return json({ error: "Cart is invalid" }, 400);

    // Load products
    const prodRows = await db
      .select({
        id: products.id,
        title: products.title,
        status: products.status,
        quantity: products.quantity,
        priceCents: products.priceCents,
      })
      .from(products)
      .where(inArray(products.id, productIds));

    const prodById = new Map(prodRows.map((p) => [p.id, p]));

    // Validate inventory + availability, and compute subtotal from DB
    const issues: Array<{ productId: string; reason: string; available?: number }> = [];
    let subtotalCents = 0;

    for (const l of lines) {
      const pid = l.productId;
      if (!pid) continue;

      const p = prodById.get(pid);
      if (!p) {
        issues.push({ productId: pid, reason: "Product missing" });
        continue;
      }

      if (p.status !== "active") {
        issues.push({ productId: pid, reason: "Product not active" });
        continue;
      }

      const available = Number(p.quantity ?? 0);
      if (!Number.isFinite(available) || available <= 0) {
        issues.push({ productId: pid, reason: "Out of stock", available: 0 });
        continue;
      }

      const qty = Math.max(1, Number(l.qty ?? 1));
      if (qty > available) {
        issues.push({ productId: pid, reason: "Not enough inventory", available });
        continue;
      }

      const unit = Number(p.priceCents ?? 0);
      if (!Number.isFinite(unit) || unit < 0) {
        issues.push({ productId: pid, reason: "Invalid price" });
        continue;
      }

      subtotalCents += unit * qty;
    }

    // If anything is wrong, do NOT charge
    if (issues.length) {
      return json(
        {
          error: "Cart validation failed",
          issues,
        },
        409
      );
    }

    // Compute final amount server-side
    let amountCents = subtotalCents + shippingCents + taxCents - loyaltyCreditsCents;
    if (!Number.isFinite(amountCents)) amountCents = subtotalCents;
    amountCents = Math.max(0, Math.floor(amountCents));

    // Attach user id if available
    let userId: string | null = null;
    try {
      const a = await auth();
      userId = a?.userId || null;
    } catch {
      // ignore
    }

    const intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: {
        cartId,
        userId: userId ?? "",
        subtotalCents: String(subtotalCents),
        shippingCents: String(shippingCents),
        taxCents: String(taxCents),
        loyaltyCreditsCents: String(loyaltyCreditsCents),
      },
    });

    return json({
      clientSecret: intent.client_secret,
      amountCents,
      subtotalCents,
      shippingCents,
      taxCents,
      loyaltyCreditsCents,
      cartId,
    });
  } catch (err: any) {
    console.error("[create-payment-intent] error", err);
    return json({ error: s(err?.message || err) || "Failed to create payment intent" }, 500);
  }
}
