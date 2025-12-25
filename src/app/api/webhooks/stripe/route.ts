import "server-only";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { carts, cartLines } from "@/lib/db/schema/cart";
import { products, productImages } from "@/lib/db/schema/shop";
import { orders, orderItems } from "@/lib/db/schema/orders";
import { and, eq, inArray, sql, asc } from "drizzle-orm";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-10-29.clover",
});

const secret = process.env.STRIPE_WEBHOOK_SECRET!;

// small helper: pick the first image by sort
async function getPrimaryImages(productIds: string[]) {
  if (!productIds.length) return new Map<string, string>();

  const imgs = await db
    .select({
      productId: productImages.productId,
      url: productImages.url,
      sort: productImages.sort,
    })
    .from(productImages)
    .where(inArray(productImages.productId, productIds))
    .orderBy(asc(productImages.productId), asc(productImages.sort));

  const map = new Map<string, string>();
  for (const i of imgs) if (!map.has(i.productId)) map.set(i.productId, i.url);
  return map;
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "No signature" }, { status: 400 });

  const raw = await req.arrayBuffer();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(Buffer.from(raw), sig, secret);
  } catch (e) {
    console.error("[stripe webhook] signature verify failed", e);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Create order from successful paid checkout
  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const s = event.data.object as Stripe.Checkout.Session;

  // For cards, this will be "paid". For async payment methods, Stripe may complete before paid.
  if (s.payment_status !== "paid") {
    return NextResponse.json({ received: true });
  }

  const stripeSessionId = s.id;

  const paymentIntentId =
    typeof s.payment_intent === "string"
      ? s.payment_intent
      : s.payment_intent?.id ?? null;

  const cartId = (s.metadata?.cartId as string) || null;

  // Idempotency: don't duplicate if Stripe retries webhook
  const existing = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.stripeSessionId, stripeSessionId))
    .limit(1);

  if (existing.length) {
    return NextResponse.json({ received: true });
  }

  if (!cartId) {
    console.error("[stripe webhook] missing cartId metadata on session", stripeSessionId);
    return NextResponse.json({ error: "Missing cartId" }, { status: 400 });
  }

  // Pull cart lines: your cart uses listing_id UUID for shop products
  const lines = await db
    .select({
      id: cartLines.id,
      qty: cartLines.qty,
      listingId: cartLines.listingId,
    })
    .from(cartLines)
    .where(and(eq(cartLines.cartId, cartId), sql`${cartLines.listingId} is not null`));

  const productIds = lines.map((l) => l.listingId).filter(Boolean) as string[];
  if (!productIds.length) {
    return NextResponse.json({ error: "Cart empty at webhook time" }, { status: 400 });
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
  const imageById = await getPrimaryImages(productIds);

  // compute totals + validate again
  let subtotal = 0;

  const normalized = lines
    .map((l) => {
      const p = l.listingId ? byId.get(l.listingId) : null;
      if (!p) return null;

      const qty = Math.max(1, Math.min(99, Number(l.qty) || 1));
      const unit = Number(p.priceCents ?? 0);

      if (p.status !== "active") throw new Error(`Product not active: ${p.title}`);
      if (Number(p.quantity ?? 0) < qty) throw new Error(`Insufficient stock: ${p.title}`);

      const lineTotal = unit * qty;
      subtotal += lineTotal;

      return {
        productId: p.id,
        title: p.title,
        unit,
        qty,
        lineTotal,
        imageUrl: imageById.get(p.id) ?? null,
      };
    })
    .filter(Boolean) as Array<{
    productId: string;
    title: string;
    unit: number;
    qty: number;
    lineTotal: number;
    imageUrl: string | null;
  }>;

  // ---- Capture ALL customer/shipping data (type-safe + fallback) ----
  const anyS = s as any; // Stripe types vary; this keeps us resilient.

  const customerEmail = s.customer_details?.email ?? undefined;
  const customerName = s.customer_details?.name ?? undefined;
  const customerPhone = s.customer_details?.phone ?? undefined;

  // billing address is usually customer_details.address
  const billingAddress = (s.customer_details?.address as any) ?? undefined;

  // shipping_details may exist depending on Checkout config + types
  const shippingDetails = anyS.shipping_details ?? null;

  const shippingName =
    (shippingDetails?.name as string | undefined) ?? customerName ?? undefined;

  const shippingPhone =
    (shippingDetails?.phone as string | undefined) ?? customerPhone ?? undefined;

  const shippingAddress =
    (shippingDetails?.address as any) ??
    (s.customer_details?.address as any) ??
    undefined;

  // store raw Stripe Session snapshot (everything)
  const stripeSessionRaw = anyS ?? undefined;

  const orderId = randomUUID();

  // Transaction: create order + items + decrement inventory + close cart
  await db.transaction(async (tx) => {
    await tx.insert(orders).values({
      id: orderId,
      cartId,
      stripeSessionId,
      stripePaymentIntentId: paymentIntentId ?? undefined,

      status: "paid",
      currency: (s.currency ?? "usd").toLowerCase(),

      subtotalCents: subtotal,
      taxCents: 0,
      shippingCents: 0,
      totalCents: subtotal,

      email: customerEmail,
      customerName,
      customerPhone,

      billingAddress,
      shippingName,
      shippingPhone,
      shippingAddress,

      stripeSessionRaw,
    });

    await tx.insert(orderItems).values(
      normalized.map((it) => ({
        orderId,
        productId: it.productId,
        title: it.title,
        unitPriceCents: it.unit,
        qty: it.qty,
        lineTotalCents: it.lineTotal,
        imageUrl: it.imageUrl ?? undefined,
      }))
    );

    // Decrement inventory
    for (const it of normalized) {
      await tx
        .update(products)
        .set({
          quantity: sql`${products.quantity} - ${it.qty}`,
          updatedAt: sql`now()`,
        })
        .where(eq(products.id, it.productId));
    }

    // Close cart (if carts.status exists; ignore if not)
    try {
      await tx
        .update(carts)
        .set({ status: sql`'checked_out'`, updatedAt: sql`now()` } as any)
        .where(eq(carts.id, cartId));
    } catch {
      // safe ignore
    }
  });

  return NextResponse.json({ received: true });
}
