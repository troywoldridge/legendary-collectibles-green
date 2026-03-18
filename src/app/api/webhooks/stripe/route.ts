import "server-only";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { logCheckoutEvent } from "@/lib/checkoutAnalytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type StripeMetadata = Record<string, string>;

type ItemsJsonRow = {
  productId: string;
  qty: number;
  unitCents: number;
  title: string;
  shippingClass?: string | null;
  shippingWeightLbs?: number | null;
};

type OrderLookupRow = {
  id: string;
  status: string;
};

type ProductImageRow = {
  product_id: string;
  url: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function s(v: unknown): string {
  return String(v ?? "").trim();
}

function toInt(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function isUuid(v: unknown): v is string {
  return UUID_RE.test(s(v));
}

function asUuidOrNull(v: unknown): string | null {
  const value = s(v);
  return isUuid(value) ? value : null;
}

function getStripe() {
  const key = s(process.env.STRIPE_SECRET_KEY);
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");

  return new Stripe(key, {
    apiVersion: "2025-10-29.clover",
  });
}

function mdGet(
  md: StripeMetadata | null | undefined,
  ...keys: string[]
): string {
  const m = md || {};
  for (const k of keys) {
    const v = s(m[k]);
    if (v) return v;
  }
  return "";
}

function getStripeId(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object" && value !== null && "id" in value) {
    return s((value as { id?: unknown }).id);
  }
  return "";
}

function getShippingDetails(session: Stripe.Checkout.Session): {
  name: string | null;
  phone: string | null;
  address: Record<string, unknown> | null;
} {
  const anySession = session as any;

  // Newer Checkout Session shape
  const collected = anySession?.collected_information?.shipping_details;

  // Backward compatibility fallback
  const legacy = anySession?.shipping_details;

  const shipping = collected || legacy || null;

  return {
    name: s(shipping?.name) || null,
    phone: s(shipping?.phone) || null,
    address:
      shipping && typeof shipping.address === "object" && shipping.address
        ? shipping.address
        : null,
  };
}

function getCustomerDetails(session: Stripe.Checkout.Session) {
  const cd = (session.customer_details as any) || null;

  return {
    email: s(cd?.email || session.customer_email) || null,
    name: s(cd?.name) || null,
    phone: s(cd?.phone) || null,
    address:
      cd && typeof cd.address === "object" && cd.address ? cd.address : null,
  };
}

function parseItemsJson(raw: unknown): ItemsJsonRow[] {
  try {
    const parsed = JSON.parse(s(raw) || "[]");
    if (!Array.isArray(parsed)) return [];

    const out: ItemsJsonRow[] = [];

    for (const row of parsed) {
      const productId = s((row as any)?.productId);
      const qty = Math.max(1, toInt((row as any)?.qty, 1));
      const unitCents = Math.max(0, toInt((row as any)?.unitCents, 0));
      const title = s((row as any)?.title) || "Item";
      const shippingClass = s((row as any)?.shippingClass) || null;

      const rawWeight = (row as any)?.shippingWeightLbs;
      const shippingWeightLbs =
        rawWeight === null || rawWeight === undefined || rawWeight === ""
          ? null
          : Number.isFinite(Number(rawWeight))
            ? Number(rawWeight)
            : null;

      if (!productId) continue;

      out.push({
        productId,
        qty,
        unitCents,
        title,
        shippingClass,
        shippingWeightLbs,
      });
    }

    return out;
  } catch {
    return [];
  }
}

function jsonbOrNull(value: unknown) {
  if (value === null || value === undefined) return null;
  return sql`${JSON.stringify(value)}::jsonb`;
}

async function logPaymentFailedFromIntent(
  event: Stripe.Event,
  pi: Stripe.PaymentIntent
) {
  const reason =
    s((pi.last_payment_error as any)?.message) ||
    s((pi.last_payment_error as any)?.code) ||
    s((pi as any)?.cancellation_reason) ||
    "payment_failed";

  const meta = (pi.metadata || {}) as StripeMetadata;
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
}

async function logAsyncPaymentFailedFromSession(
  event: Stripe.Event,
  session: Stripe.Checkout.Session
) {
  const md = (session.metadata || {}) as StripeMetadata;
  const cartId = mdGet(md, "cartId", "cart_id");
  const userId = mdGet(md, "userId", "user_id");
  const customer = getCustomerDetails(session);

  await logCheckoutEvent({
    eventType: "payment_failed",
    userId: userId || null,
    cartId: cartId || null,
    email: customer.email,
    subtotalCents: toInt(md.subtotalCents, 0) || null,
    shippingCents:
      Math.max(
        0,
        toInt(md.baseShippingCents, 0) + toInt(md.insuranceCents, 0)
      ) || null,
    taxCents: toInt((session.total_details as any)?.amount_tax, 0) || null,
    totalCents: toInt(session.amount_total, 0) || null,
    metadata: {
      stripeEventId: s(event.id),
      stripeSessionId: s(session.id),
      reason: "async_payment_failed",
    },
  });
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
    // Analytics-only failures
    // ------------------------------------------------------------
    if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object as Stripe.PaymentIntent;
      await logPaymentFailedFromIntent(event, pi);
      return new NextResponse("ok", { status: 200 });
    }

    if (event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object as Stripe.Checkout.Session;
      await logAsyncPaymentFailedFromSession(event, session);
      return new NextResponse("ok", { status: 200 });
    }

    // ------------------------------------------------------------
    // Fulfillment events only
    // ------------------------------------------------------------
    if (
      event.type !== "checkout.session.completed" &&
      event.type !== "checkout.session.async_payment_succeeded"
    ) {
      return new NextResponse("ok", { status: 200 });
    }

    const session = event.data.object as Stripe.Checkout.Session;
    const md = (session.metadata || {}) as StripeMetadata;

    const stripeSessionId = s(session.id);
    const paymentIntentId = getStripeId(session.payment_intent);
    const stripeCustomerId = getStripeId(session.customer);
    const currency = s(session.currency || "usd").toLowerCase();

    const cartId = asUuidOrNull(mdGet(md, "cartId", "cart_id"));
    const userId = s(mdGet(md, "userId", "user_id")) || null;

    const subtotalCents = Math.max(0, toInt(md.subtotalCents, 0));
    const baseShippingCents = Math.max(0, toInt(md.baseShippingCents, 0));
    const insuranceCents = Math.max(0, toInt(md.insuranceCents, 0));
    const shippingCents = Math.max(0, baseShippingCents + insuranceCents);
    const taxCents = Math.max(
      0,
      toInt((session.total_details as any)?.amount_tax, 0)
    );
    const totalCents = Math.max(0, toInt(session.amount_total, 0));

    const customer = getCustomerDetails(session);
    const shipping = getShippingDetails(session);

    const items = parseItemsJson(md.items_json);
    if (!items.length) {
      console.error("[stripe/webhook] missing or invalid items_json", {
        stripeEventId: event.id,
        stripeSessionId,
      });

      return NextResponse.json(
        { error: "Missing or invalid items_json in session metadata" },
        { status: 400 }
      );
    }

    const validProductIds = items
      .map((it) => asUuidOrNull(it.productId))
      .filter((v): v is string => Boolean(v));

    await db.transaction(async (tx) => {
      const existingOrderRes = await tx.execute(sql`
        SELECT id, status
        FROM orders
        WHERE stripe_session_id = ${stripeSessionId}
        LIMIT 1
        FOR UPDATE
      `);

      const existingOrder = ((existingOrderRes as any)?.rows?.[0] ||
        null) as OrderLookupRow | null;

      const alreadyPaid =
        !!existingOrder && s(existingOrder.status).toLowerCase() === "paid";

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
          ${userId},
          ${cartId ? sql`${cartId}::uuid` : null},
          ${stripeSessionId},
          ${paymentIntentId || null},
          'paid'::order_status,
          ${currency || "usd"},
          ${subtotalCents},
          ${taxCents},
          ${shippingCents},
          ${totalCents},
          ${customer.email},
          ${customer.name},
          ${customer.phone},
          ${customer.address ? jsonbOrNull(customer.address) : null},
          ${shipping.name},
          ${shipping.phone},
          ${shipping.address ? jsonbOrNull(shipping.address) : null},
          ${sql`${JSON.stringify({
            ...session,
            __normalized: {
              stripeCustomerId: stripeCustomerId || null,
            },
          })}::jsonb`},
          now(),
          now()
        )
        ON CONFLICT (stripe_session_id) DO UPDATE
        SET
          stripe_payment_intent_id = COALESCE(EXCLUDED.stripe_payment_intent_id, orders.stripe_payment_intent_id),
          status = EXCLUDED.status,
          currency = EXCLUDED.currency,
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

      const orderId = s((orderRes as any)?.rows?.[0]?.id);
      if (!orderId) {
        throw new Error("Failed to create or update order");
      }

      // ----------------------------------------------------------
      // Idempotency guard:
      // If we already processed this order as paid earlier, do not
      // delete/reinsert items or decrement inventory again.
      // ----------------------------------------------------------
      if (!alreadyPaid) {
        let imgByProductId = new Map<string, string>();

        if (validProductIds.length) {
          const imgRes = await tx.execute(sql`
            WITH first_image AS (
              SELECT DISTINCT ON (pi.product_id)
                pi.product_id,
                pi.url
              FROM product_images pi
              WHERE pi.product_id = ANY(${validProductIds}::uuid[])
              ORDER BY pi.product_id, pi.sort ASC, pi.created_at ASC
            )
            SELECT product_id, url
            FROM first_image
          `);

          const imgRows = ((imgRes as any)?.rows ?? []) as ProductImageRow[];
          imgByProductId = new Map(
            imgRows.map((r) => [s(r.product_id), s(r.url)])
          );
        }

        await tx.execute(sql`
          DELETE FROM order_items
          WHERE order_id = ${orderId}::uuid
        `);

        for (const it of items) {
          const pid = asUuidOrNull(it.productId);
          const qty = Math.max(1, toInt(it.qty, 1));
          const unit = Math.max(0, toInt(it.unitCents, 0));
          const title = s(it.title) || "Item";
          const img = pid ? imgByProductId.get(pid) || null : null;

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

          if (pid) {
            await tx.execute(sql`
              UPDATE products
              SET quantity = GREATEST(COALESCE(quantity, 0) - ${qty}, 0),
                  updated_at = now()
              WHERE id = ${pid}::uuid
            `);
          }
        }

        if (cartId) {
          await tx.execute(sql`
            UPDATE carts
            SET status = 'checked_out',
                updated_at = now()
            WHERE id = ${cartId}::uuid
          `);
        }
      }

      await logCheckoutEvent({
        eventType: "purchase_completed",
        userId,
        cartId,
        email: customer.email,
        subtotalCents,
        shippingCents,
        taxCents,
        totalCents,
        metadata: {
          stripeEventId: s(event.id),
          stripeEventType: s(event.type),
          stripeSessionId,
          stripePaymentIntentId: paymentIntentId || null,
          stripeCustomerId: stripeCustomerId || null,
          alreadyPaid,
          itemCount: items.length,
        },
      });
    });

    return new NextResponse("ok", { status: 200 });
  } catch (err: any) {
    console.error("[stripe/webhook] error", {
      message: err?.message || String(err),
      stack: err?.stack || null,
    });

    return NextResponse.json(
      { error: String(err?.message || err) || "Webhook error" },
      { status: 500 }
    );
  }
}