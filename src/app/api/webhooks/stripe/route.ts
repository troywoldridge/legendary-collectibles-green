// src/app/api/webhooks/stripe/route.ts
import "server-only";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { headers } from "next/headers";
import { db } from "@/lib/db";

import { billingCustomers, userPlans } from "@/lib/db/schema/billing";
import { orders, orderItems } from "@/lib/db/schema/orders";
import { products } from "@/lib/db/schema/shop";

import { eq, sql } from "drizzle-orm";

// ✅ Use a real Stripe API version
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-10-29.clover",
});

const secret = process.env.STRIPE_WEBHOOK_SECRET!;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const sig = (await headers()).get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "No signature" }, { status: 400 });

  if (!secret) return NextResponse.json({ error: "Missing STRIPE_WEBHOOK_SECRET" }, { status: 500 });

  // Stripe requires the raw body to verify signature
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err: any) {
    console.error("[stripe webhook] invalid signature:", err?.message || err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    // ----------------------------
    // 1) SUBSCRIPTIONS / BILLING (your existing logic)
    // ----------------------------

    // First purchase: persist customer → user + plan
    if (event.type === "checkout.session.completed") {
      const s = event.data.object as Stripe.Checkout.Session;

      const userId = (s.metadata?.userId as string) || null;
      const plan = (s.metadata?.plan as "collector" | "pro" | undefined) || "collector";
      const stripeCustomerId = typeof s.customer === "string" ? s.customer : s.customer?.id || null;

      if (userId && stripeCustomerId) {
        await db
          .insert(billingCustomers)
          .values({ userId, stripeCustomerId })
          .onConflictDoUpdate({
            target: billingCustomers.userId,
            set: { stripeCustomerId },
          });

        await db
          .insert(userPlans)
          .values({ userId, planId: plan })
          .onConflictDoUpdate({ target: userPlans.userId, set: { planId: plan } });
      }
    }

    // Subscription deleted → downgrade plan
    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const cust = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
      if (cust) {
        const rows = await db.select().from(billingCustomers).where(eq(billingCustomers.stripeCustomerId, cust));
        const u = rows[0];
        if (u) {
          await db
            .insert(userPlans)
            .values({ userId: u.userId, planId: "free" })
            .onConflictDoUpdate({ target: userPlans.userId, set: { planId: "free" } });
        }
      }
    }

    // ----------------------------
    // 2) SHOP ORDERS (new logic)
    // ----------------------------
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      // We only create shop orders when metadata says buy_now (or later cart_checkout)
      // If your subscription checkout.session.completed does NOT set source=buy_now, it will be ignored.
      const meta = session.metadata || {};
      const source = meta.source || "";

      if (source === "buy_now") {
        // Expand line items (safe even if you currently rely on metadata)
        const full = await stripe.checkout.sessions.retrieve(session.id, {
          expand: ["line_items"],
        });

        const stripeSessionId = full.id;
        const currency = (full.currency || "usd").toLowerCase();
        const email = full.customer_details?.email || full.customer_email || null;
        const paymentIntent =
          typeof full.payment_intent === "string" ? full.payment_intent : full.payment_intent?.id || null;

        // ✅ Idempotency: if we already created this order, do nothing
        const existing = await db
          .select({ id: orders.id })
          .from(orders)
          .where(eq(orders.stripeSessionId, stripeSessionId))
          .limit(1);

        if (existing.length) {
          return NextResponse.json({ received: true, deduped: true }, { status: 200 });
        }

        const productId = meta.productId;
        const quantity = Math.max(1, Math.min(99, parseInt(meta.quantity || "1", 10) || 1));

        if (!productId) {
          console.warn("[stripe webhook] buy_now missing productId metadata", meta);
          return NextResponse.json({ received: true, warning: "missing productId" }, { status: 200 });
        }

        // Load product
        const prow = await db.select().from(products).where(eq(products.id, productId)).limit(1);
        const p = prow[0];

        if (!p) {
          console.error("[stripe webhook] product not found", productId);
          return NextResponse.json({ received: true, error: "product not found" }, { status: 200 });
        }

        const unit = Number(p.priceCents ?? 0);
        const subtotalCents = unit * quantity;

        // Stripe total if available; fallback to subtotal
        const totalCents = typeof full.amount_total === "number" ? full.amount_total : subtotalCents;

        // Create order
       const created = await db
  .insert(orders)
  .values({
    status: "paid",
    currency,
    subtotalCents,
    totalCents,
    email: email ?? undefined,
    stripeSessionId,
    stripePaymentIntentId: paymentIntent ?? undefined,
  })
  .returning();

const orderId = created?.[0]?.id;
if (!orderId) {
  console.error("[stripe webhook] order insert returned no id");
  return NextResponse.json({ received: true, error: "order insert failed" }, { status: 200 });
}




        // Create order item snapshot
        await db.insert(orderItems).values({
          orderId,
          productId: p.id,
          title: p.title,
          unitPriceCents: unit,
          quantity,
          lineTotalCents: subtotalCents,
        });

        // Decrement inventory (simple stock)
        await db
          .update(products)
          .set({
            quantity: sql`GREATEST(${products.quantity} - ${quantity}, 0)`,
            updatedAt: sql`now()`,
          })
          .where(eq(products.id, p.id));

        return NextResponse.json({ received: true, orderId }, { status: 200 });
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    console.error("[stripe webhook] handler error:", err);
    // Return 200 so Stripe doesn't retry forever; idempotency protects us anyway.
    return NextResponse.json({ received: true, error: "handler failed" }, { status: 200 });
  }
}
