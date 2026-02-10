import "server-only";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { logCheckoutEvent } from "@/lib/checkoutAnalytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function s(v: unknown): string {
  return String(v ?? "").trim();
}
function toInt(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function getStripe() {
  const key = s(process.env.STRIPE_SECRET_KEY);
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(key, {
    apiVersion: "2025-10-29.clover",
  });
}

type ItemsJsonRow = {
  productId: string;
  qty: number;
  unitCents: number;
  title: string;
  shippingClass?: string | null;
  shippingWeightLbs?: number | null;
};

function mdGet(md: Record<string, string> | null | undefined, ...keys: string[]) {
  const m = md || {};
  for (const k of keys) {
    const v = s(m[k]);
    if (v) return v;
  }
  return "";
}

export async function POST(req: Request) {
  try {
    const webhookSecret = s(process.env.STRIPE_WEBHOOK_SECRET);
    if (!webhookSecret) {
      return NextResponse.json(
        { error: "Missing STRIPE_WEBHOOK_SECRET" },
        { status: 500 }
      );
    }

    const sig = req.headers.get("stripe-signature");
    if (!sig) {
      return NextResponse.json(
        { error: "Missing stripe-signature" },
        { status: 400 }
      );
    }

    // IMPORTANT: use RAW body for signature verification
    const rawBody = await req.text();

    const stripe = getStripe();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err: any) {
      console.error("[stripe/webhook] signature error", err?.message || err);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    // ------------------------------------------------------------
    // ✅ payment_failed analytics (no DB fulfillment here)
    // ------------------------------------------------------------
    if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object as Stripe.PaymentIntent;

      const reason =
        s((pi.last_payment_error as any)?.message) ||
        s((pi.last_payment_error as any)?.code) ||
        s((pi as any)?.cancellation_reason) ||
        "payment_failed";

      const meta = (pi.metadata || {}) as Record<string, string>;
      const cartId = mdGet(meta, "cartId", "cart_id");
      const userId = mdGet(meta, "userId", "user_id");

      await logCheckoutEvent({
        eventType: "payment_failed",
        userId: userId || null,
        cartId: cartId || null,
        email: null,
        metadata: {
          stripeEventId: s(event.id),
          stripePaymentIntentId: s(pi.id),
          amountCents: toInt(pi.amount, 0),
          currency: s(pi.currency || "usd").toLowerCase(),
          failure: reason,
          lastPaymentError: pi.last_payment_error
            ? {
                code: s((pi.last_payment_error as any)?.code),
                decline_code: s((pi.last_payment_error as any)?.decline_code),
                message: s((pi.last_payment_error as any)?.message),
                type: s((pi.last_payment_error as any)?.type),
              }
            : null,
        },
      });

      return new NextResponse("ok", { status: 200 });
    }

    if (event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const md = (session.metadata || {}) as Record<string, string>;

      const cartId = mdGet(md, "cartId", "cart_id");
      const userId = mdGet(md, "userId", "user_id");
      const email = s((session.customer_details as any)?.email || session.customer_email) || null;

      await logCheckoutEvent({
        eventType: "payment_failed",
        userId: userId || null,
        cartId: cartId || null,
        email,
        subtotalCents: toInt(md.subtotalCents, 0) || null,
        shippingCents: Math.max(0, toInt(md.baseShippingCents, 0) + toInt(md.insuranceCents, 0)) || null,
        taxCents: toInt((session.total_details as any)?.amount_tax, 0) || null,
        totalCents: toInt(session.amount_total, 0) || null,
        metadata: {
          stripeEventId: s(event.id),
          stripeSessionId: s(session.id),
          reason: "async_payment_failed",
        },
      });

      return new NextResponse("ok", { status: 200 });
    }

    // ------------------------------------------------------------
    // Existing fulfillment path (unchanged): only finalize on completed
    // ------------------------------------------------------------
    if (
      event.type !== "checkout.session.completed" &&
      event.type !== "checkout.session.async_payment_succeeded"
    ) {
      return new NextResponse("ok", { status: 200 });
    }

    const session = event.data.object as Stripe.Checkout.Session;

    const stripeSessionId = s(session.id);
    const paymentIntentId = s(session.payment_intent);
    const currency = s(session.currency || "usd").toLowerCase();

    const md = (session.metadata || {}) as Record<string, string>;

    const cartId = s(md.cartId || md.cart_id);
    const userId = s(md.userId || md.user_id);
    const subtotalCents = toInt(md.subtotalCents, 0);

    const baseShippingCents = toInt(md.baseShippingCents, 0);
    const insuranceCents = toInt(md.insuranceCents, 0);
    const shippingCents = Math.max(0, baseShippingCents + insuranceCents);

    const taxCents =
      toInt((session.total_details as any)?.amount_tax, 0);

    const totalCents = toInt(session.amount_total, 0);

    const email = s((session.customer_details as any)?.email || session.customer_email);
    const customerName = s((session.customer_details as any)?.name);
    const customerPhone = s((session.customer_details as any)?.phone);

    const shippingDetails = (session as any).shipping_details || null;

    const shippingName = s(shippingDetails?.name);
    const shippingPhone = s(shippingDetails?.phone);

    const billingAddress = (session.customer_details as any)?.address || null;
    const shippingAddress = shippingDetails?.address || null;

    let items: ItemsJsonRow[] = [];
    try {
      items = JSON.parse(md.items_json || "[]");
      if (!Array.isArray(items)) items = [];
    } catch {
      items = [];
    }

    if (!items.length) {
      console.error("[stripe/webhook] missing items_json; session:", stripeSessionId);
      return NextResponse.json(
        { error: "Missing items_json in session metadata" },
        { status: 400 }
      );
    }

    const productIds = items.map((it) => it.productId).filter(Boolean);

    await db.transaction(async (tx) => {
      const orderRes = await tx.execute(sql`
        INSERT INTO orders (
          user_id,
          cart_id,
          stripe_session_id,
          stripe_payment_intent_id,
          status,
          currency,
          subtotal_cents,
          tax_cents,
          shipping_cents,
          total_cents,
          email,
          customer_name,
          customer_phone,
          billing_address,
          shipping_name,
          shipping_phone,
          shipping_address,
          stripe_session_raw,
          created_at,
          updated_at
        )
        VALUES (
          ${userId || null},
          ${cartId ? sql`${cartId}::uuid` : null},
          ${stripeSessionId},
          ${paymentIntentId || null},
          'paid'::order_status,
          ${currency || "usd"},
          ${Math.max(0, subtotalCents)},
          ${Math.max(0, taxCents)},
          ${Math.max(0, shippingCents)},
          ${Math.max(0, totalCents)},
          ${email || null},
          ${customerName || null},
          ${customerPhone || null},
          ${billingAddress ? sql`${JSON.stringify(billingAddress)}::jsonb` : null},
          ${shippingName || null},
          ${shippingPhone || null},
          ${shippingAddress ? sql`${JSON.stringify(shippingAddress)}::jsonb` : null},
          ${sql`${JSON.stringify(session)}::jsonb`},
          now(),
          now()
        )
        ON CONFLICT (stripe_session_id) DO UPDATE
        SET
          stripe_payment_intent_id = EXCLUDED.stripe_payment_intent_id,
          status = EXCLUDED.status,
          subtotal_cents = EXCLUDED.subtotal_cents,
          tax_cents = EXCLUDED.tax_cents,
          shipping_cents = EXCLUDED.shipping_cents,
          total_cents = EXCLUDED.total_cents,
          email = COALESCE(EXCLUDED.email, orders.email),
          customer_name = COALESCE(EXCLUDED.customer_name, orders.customer_name),
          customer_phone = COALESCE(EXCLUDED.customer_phone, orders.customer_phone),
          billing_address = COALESCE(EXCLUDED.billing_address, orders.billing_address),
          shipping_name = COALESCE(EXCLUDED.shipping_name, orders.shipping_name),
          shipping_phone = COALESCE(EXCLUDED.shipping_phone, orders.shipping_phone),
          shipping_address = COALESCE(EXCLUDED.shipping_address, orders.shipping_address),
          stripe_session_raw = EXCLUDED.stripe_session_raw,
          updated_at = now()
        RETURNING id
      `);

      const orderId = (orderRes as any)?.rows?.[0]?.id as string | undefined;
      if (!orderId) throw new Error("Failed to create order");

      const imgRes = await tx.execute(sql`
        WITH first_image AS (
          SELECT DISTINCT ON (pi.product_id)
            pi.product_id,
            pi.url
          FROM product_images pi
          WHERE pi.product_id = ANY(${productIds}::uuid[])
          ORDER BY pi.product_id, pi.sort ASC, pi.created_at ASC
        )
        SELECT product_id, url
        FROM first_image
      `);

      const imgRows: Array<{ product_id: string; url: string }> = (imgRes as any)?.rows ?? [];
      const imgByProductId = new Map(imgRows.map((r) => [String(r.product_id), String(r.url)]));

      await tx.execute(sql`DELETE FROM order_items WHERE order_id = ${orderId}::uuid`);

      for (const it of items) {
        const pid = s(it.productId);
        const qty = Math.max(1, toInt(it.qty, 1));
        const unit = Math.max(0, toInt(it.unitCents, 0));
        const title = s(it.title) || "Item";
        const img = imgByProductId.get(pid) || null;

        await tx.execute(sql`
          INSERT INTO order_items (
            order_id,
            product_id,
            title,
            unit_price_cents,
            qty,
            line_total_cents,
            image_url,
            created_at
          )
          VALUES (
            ${orderId}::uuid,
            ${pid ? sql`${pid}::uuid` : null},
            ${title},
            ${unit},
            ${qty},
            ${unit * qty},
            ${img},
            now()
          )
        `);

        await tx.execute(sql`
          UPDATE products
          SET quantity = GREATEST(COALESCE(quantity, 0) - ${qty}, 0),
              updated_at = now()
          WHERE id = ${pid}::uuid
        `);
      }

      if (cartId) {
        await tx.execute(sql`
          UPDATE carts
          SET status = 'checked_out',
              updated_at = now()
          WHERE id = ${cartId}::uuid
        `);
      }
    });

    return new NextResponse("ok", { status: 200 });
  } catch (err: any) {
    console.error("[stripe/webhook] error", err);
    return NextResponse.json(
      { error: String(err?.message || err) || "Webhook error" },
      { status: 500 }
    );
  }
}
