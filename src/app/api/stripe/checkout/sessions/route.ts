// src/app/api/stripe/checkout/sessions/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

import Stripe from "stripe";
import { NextRequest } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";

import { getStripe, baseUrlFromReq, parseJson, errorJson } from "../../_shared";
import { db } from "@/lib/db";
import { carts, cart_lines } from "@/lib/db/schema/cart";
import { products } from "@/lib/db/schema/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CartSnapshotItem = {
  productId: string;
  qty: number;
  unitCents: number;
  title: string;
};

function clampQty(n: unknown) {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return 1;
  return Math.max(1, Math.min(99, Math.floor(v)));
}

// strict UUID check (matches what you used in webhook)
function isUuid(v: unknown): v is string {
  if (typeof v !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

async function buildLineItemsFromCart(cartId: string, currency: string) {
  const lines = await db
    .select({
      id: cart_lines.id,
      qty: cart_lines.qty,
      listingId: cart_lines.listing_id,
    })
    .from(cart_lines)
    .where(
      and(eq(cart_lines.cart_id, cartId), sql`${cart_lines.listing_id} is not null`)
    );

  const productIds = lines
    .map((l) => l.listingId)
    .filter((x): x is string => typeof x === "string" && !!x);

  if (!productIds.length) {
    throw new Error("Cart empty (no listing_id lines)");
  }

  const prows = await db
    .select({
      id: products.id,
      title: products.title,
      priceCents: products.priceCents,
      status: products.status,
      quantity: products.quantity,
    })
    .from(products)
    .where(inArray(products.id, productIds));

  const byId = new Map(prows.map((p) => [p.id, p]));

  const snapshot: CartSnapshotItem[] = [];
  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

  for (const l of lines) {
    const pid = l.listingId as string;
    const p = byId.get(pid);
    if (!p) throw new Error(`Cart contains missing product id: ${pid}`);

    const qty = clampQty(l.qty);
    const unitCents = Number(p.priceCents ?? 0);

    if (p.status !== "active") throw new Error(`Product not active: ${p.title}`);
    if (Number(p.quantity ?? 0) < qty) throw new Error(`Insufficient stock: ${p.title}`);
    if (!Number.isFinite(unitCents) || unitCents <= 0) throw new Error(`Invalid price: ${p.title}`);

    snapshot.push({
      productId: pid,
      qty,
      unitCents,
      title: String(p.title ?? "Item"),
    });

    line_items.push({
      quantity: qty,
      price_data: {
        currency,
        unit_amount: unitCents,
        product_data: {
          name: String(p.title ?? "Item"),
          metadata: { productId: pid },
        },
      },
    });
  }

  if (!line_items.length || !snapshot.length) {
    throw new Error("Cart empty (no valid items)");
  }

  return { line_items, snapshot };
}

// POST /api/stripe/checkout/sessions
export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = await parseJson<any>(req);

    const base = baseUrlFromReq(req);
    const success_url =
      body?.success_url ??
      `${base}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancel_url = body?.cancel_url ?? `${base}/checkout/canceled`;

    const currency =
      typeof body?.currency === "string" && body.currency
        ? body.currency.toLowerCase()
        : "usd";

    const cartId =
      (typeof body?.cartId === "string" && body.cartId) ||
      (typeof body?.metadata?.cartId === "string" && body.metadata.cartId) ||
      null;

    // ✅ HARD REQUIRE cartId
    if (!cartId || !isUuid(cartId)) {
      return Response.json({ error: "cartId required" }, { status: 400 });
    }

    // Ensure cart exists
    const c = await db
      .select({ id: carts.id })
      .from(carts)
      .where(eq(carts.id, cartId))
      .limit(1);

    if (!c.length) {
      return Response.json({ error: "Cart not found" }, { status: 404 });
    }

    // ✅ ALWAYS build from DB (ignore any provided line_items)
    const { line_items, snapshot } = await buildLineItemsFromCart(cartId, currency);

    // ✅ HARD FAIL if snapshot cannot be attached
    const items_json = JSON.stringify(snapshot);
    if (!items_json || items_json.length < 5) {
      throw new Error("Failed to build items_json snapshot");
    }

    // ✅ IMPORTANT: Stripe client must be created at request-time
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url,
      cancel_url,
      // NOTE: In Stripe Checkout, currency is typically set via price_data.currency per line item.
      // Keeping this out avoids compatibility issues. Your line items already include currency.
      line_items,
      metadata: {
        cartId,
        items_json,
      },
    });

    return Response.json(session, { status: 200 });
  } catch (err: any) {
    return errorJson(err, 400);
  }
}
