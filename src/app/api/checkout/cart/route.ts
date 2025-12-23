import "server-only";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { carts, cartLines } from "@/lib/db/schema/cart";
import { products } from "@/lib/db/schema/shop";
import { and, eq, inArray, sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-10-29.clover",
});

const CART_COOKIE = "lc_cart_id";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function POST(req: Request) {
  try {
    const jar = await cookies();
    const cartId = jar.get(CART_COOKIE)?.value;

    if (!cartId || !isUuid(cartId)) {
      return NextResponse.json({ error: "No active cart" }, { status: 400 });
    }

    const cart = await db
      .select({ id: carts.id })
      .from(carts)
      .where(eq(carts.id, cartId))
      .limit(1);

    if (!cart.length) {
      return NextResponse.json({ error: "Cart not found" }, { status: 400 });
    }

    // ✅ Pull cart lines using the UUID column directly (DB column: product_uuid)
    const lines = await db
      .select({
        id: cartLines.id,
        qty: cartLines.qty,
        productUuid: sql<string>`(${cartLines}."product_uuid")`,
      })
      .from(cartLines)
      .where(
        and(
          eq(cartLines.cartId, cartId),
          sql`(${cartLines}."product_uuid") is not null`
        )
      );

    const productIds = lines.map((l) => l.productUuid).filter(Boolean);

    if (!productIds.length) {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
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

    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

    for (const l of lines) {
      const p = l.productUuid ? byId.get(l.productUuid) : null;
      if (!p) continue;

      const qty = Math.max(1, Math.min(99, Number(l.qty) || 1));

      if (p.status !== "active") {
        return NextResponse.json({ error: `Product not available: ${p.title}` }, { status: 400 });
      }
      if (Number(p.quantity ?? 0) < qty) {
        return NextResponse.json({ error: `Out of stock: ${p.title}` }, { status: 400 });
      }

      line_items.push({
        quantity: qty,
        price_data: {
          currency: "usd",
          unit_amount: Number(p.priceCents),
          product_data: {
            name: p.title,
            metadata: { productId: String(p.id) },
          },
        },
      });
    }

    if (!line_items.length) {
      return NextResponse.json({ error: "Cart has no valid items" }, { status: 400 });
    }

    const origin = req.headers.get("origin") || "https://legendary-collectibles.com";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      success_url: `${origin}/cart?success=1`,
      cancel_url: `${origin}/cart`,
      metadata: {
        source: "cart",
        cartId,
      },
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err) {
    console.error("[api/checkout/cart] error", err);
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}
