import "server-only";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: unknown): string {
  return String(v ?? "").trim();
}
function toInt(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

const STRIPE_SECRET_KEY = s(process.env.STRIPE_SECRET_KEY);
const STRIPE_WEBHOOK_SECRET = s(process.env.STRIPE_WEBHOOK_SECRET);

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2025-10-29.clover",
});

type ItemsJsonRow = {
  productId: string;
  qty: number;
  unitCents: number;
  title: string;
  shippingClass?: string | null;
  shippingWeightLbs?: number | null;
};

export async function POST(req: Request) {
  try {
    if (!STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });
    }
    if (!STRIPE_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Missing STRIPE_WEBHOOK_SECRET" }, { status: 500 });
    }

    const sig = req.headers.get("stripe-signature");
    if (!sig) return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });

    // IMPORTANT: use RAW body for signature verification
    const rawBody = await req.text();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err: any) {
      console.error("[stripe/webhook] signature error", err?.message || err);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    // We only need to finalize on session completed (paid or async)
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
      // Stripe Tax puts details here on completed sessions
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

    // Items snapshot from metadata (the stuff you want as order_items)
    let items: ItemsJsonRow[] = [];
    try {
      items = JSON.parse(md.items_json || "[]");
      if (!Array.isArray(items)) items = [];
    } catch {
      items = [];
    }

    // If items_json missing, don't create an empty order.
    if (!items.length) {
      console.error("[stripe/webhook] missing items_json; session:", stripeSessionId);
      return NextResponse.json({ error: "Missing items_json in session metadata" }, { status: 400 });
    }

    // pull first image per product for order_items.image_url
    const productIds = items.map((it) => it.productId).filter(Boolean);

    // Use a DB transaction: create order, create items, mark cart checked_out, decrement inventory
    await db.transaction(async (tx) => {
      // 1) create order (idempotent via UNIQUE stripe_session_id)
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

      // 2) get images
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

      // 3) wipe existing order_items (safe for idempotent retries), then insert
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

        // 4) decrement inventory (only if product still exists)
        await tx.execute(sql`
          UPDATE products
          SET quantity = GREATEST(COALESCE(quantity, 0) - ${qty}, 0),
              updated_at = now()
          WHERE id = ${pid}::uuid
        `);
      }

      // 5) mark cart checked_out (optional but nice)
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
      { status: 500 },
    );
  }
}
