// src/app/api/webhooks/stripe/route.ts
import "server-only";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { randomUUID } from "crypto";
import { asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { carts } from "@/lib/db/schema/cart";
import { products, productImages } from "@/lib/db/schema/shop";
import { orders, orderItems } from "@/lib/db/schema/orders";
import { sendEmailResend } from "@/lib/email/resend";
import { notifyDiscordSale } from "@/lib/notify/discordSales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-10-29.clover",
});

const secret = process.env.STRIPE_WEBHOOK_SECRET!;

// strict UUID check (so we NEVER insert non-uuid into uuid column)
function isUuid(v: unknown): v is string {
  if (typeof v !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

// pick first image by sort
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

function money(cents: number, currency: string) {
  const cur = (currency || "usd").toUpperCase();
  const v = (Number(cents || 0) / 100).toFixed(2);
  return `${cur} $${v}`;
}

function escapeHtml(s: string) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getBaseUrl(): string {
  const envBase =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
    process.env.SITE_URL?.replace(/\/+$/, "");
  return envBase || "http://127.0.0.1:3001";
}

async function notifySaleEmail(input: {
  orderId: string;
  stripeSessionId: string;
  currency: string;
  totalCents: number;
  customerEmail?: string;
  customerName?: string;
  shippingName?: string;
  needsManualReview?: boolean;
  items: Array<{ title: string; qty: number; unit: number; lineTotal: number }>;
}) {
  const to = process.env.SALES_NOTIFY_EMAIL_TO || "";
  const from = process.env.SALES_NOTIFY_EMAIL_FROM || "";

  if (!to || !from) return;

  const baseUrl = getBaseUrl();
  const adminOrderUrl = `${baseUrl}/admin/orders/${input.orderId}`;

  const subjectPrefix = input.needsManualReview ? "⚠️ REVIEW" : "💰 Sale";
  const subject = `${subjectPrefix}: ${input.items.length} item(s) • ${money(
    input.totalCents,
    input.currency
  )}`;

  const linesHtml = input.items
    .map((it) => {
      const title = escapeHtml(it.title);
      return `<tr>
        <td style="padding:6px 0;">${title}</td>
        <td style="padding:6px 0; text-align:center;">x${it.qty}</td>
        <td style="padding:6px 0; text-align:right;">${money(it.unit, input.currency)}</td>
        <td style="padding:6px 0; text-align:right;">${money(it.lineTotal, input.currency)}</td>
      </tr>`;
    })
    .join("");

  const html = `
  <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;">
    <h2 style="margin:0 0 10px;">${
      input.needsManualReview ? "Sale captured (manual review needed) ⚠️" : "New sale 🎉"
    }</h2>
    <div style="margin:0 0 14px; color:#555;">
      <div><strong>Order:</strong> ${escapeHtml(input.orderId)}</div>
      <div><strong>Stripe Session:</strong> ${escapeHtml(input.stripeSessionId)}</div>
      <div><strong>Total:</strong> ${money(input.totalCents, input.currency)}</div>
    </div>

    <table style="width:100%; border-collapse: collapse;">
      <thead>
        <tr>
          <th style="text-align:left; padding:6px 0; border-bottom:1px solid #eee;">Item</th>
          <th style="text-align:center; padding:6px 0; border-bottom:1px solid #eee;">Qty</th>
          <th style="text-align:right; padding:6px 0; border-bottom:1px solid #eee;">Unit</th>
          <th style="text-align:right; padding:6px 0; border-bottom:1px solid #eee;">Total</th>
        </tr>
      </thead>
      <tbody>${linesHtml}</tbody>
    </table>

    <div style="margin-top:16px;">
      <a href="${adminOrderUrl}" style="display:inline-block; padding:10px 14px; border-radius:8px; text-decoration:none; background:#111; color:#fff;">
        View Order
      </a>
    </div>
  </div>`;

  await sendEmailResend({
    to,
    from,
    subject,
    html,
    text: `New sale: ${input.orderId}\nTotal: ${money(input.totalCents, input.currency)}`,
    idempotencyKey: `sale_${input.orderId}`,
  });
}

type CheckoutItemsSnapshot = Array<{
  productId: string;
  qty: number;
  unitCents: number;
  title: string;
}>;

function safeParseItemsJson(v: unknown): CheckoutItemsSnapshot | null {
  if (!v) return null;
  try {
    const parsed = JSON.parse(String(v));
    if (!Array.isArray(parsed)) return null;

    const ok = parsed.every(
      (x) =>
        x &&
        typeof x === "object" &&
        typeof x.productId === "string" &&
        typeof x.title === "string" &&
        typeof x.qty !== "undefined" &&
        typeof x.unitCents !== "undefined"
    );

    return ok ? (parsed as CheckoutItemsSnapshot) : null;
  } catch {
    return null;
  }
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

    // Red discord ping for signature issues (optional)
    await notifyDiscordSale({
      severity: "error",
      reason: "Stripe signature verification failed.",
    });

    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Only handle this event
  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  try {
    const s = event.data.object as Stripe.Checkout.Session;

    if (s.payment_status !== "paid") {
      return NextResponse.json({ received: true });
    }

    const stripeSessionId = s.id;

    // Idempotency (Stripe retries)
    const existing = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.stripeSessionId, stripeSessionId))
      .limit(1);

    if (existing.length) {
      return NextResponse.json({ received: true });
    }

    const paymentIntentId =
      typeof s.payment_intent === "string"
        ? s.payment_intent
        : s.payment_intent?.id ?? undefined;

    const cartId = isUuid((s.metadata as any)?.cartId) ? ((s.metadata as any).cartId as string) : undefined;

    const currency = (s.currency ?? "usd").toLowerCase();
    const totalCents = Number(s.amount_total ?? 0);
    const subtotalCents = Number(s.amount_subtotal ?? totalCents);

    // Stripe line items (always)
    const li = await stripe.checkout.sessions.listLineItems(stripeSessionId, { limit: 100 });
    const displayItems = li.data.map((x) => ({
      title: x.description || "Item",
      qty: Number(x.quantity ?? 1),
      unit: Number(x.price?.unit_amount ?? 0),
      lineTotal: Number(x.amount_total ?? 0),
    }));

    // Snapshot mapping (preferred)
    const itemsSnapshot = safeParseItemsJson((s.metadata as any)?.items_json);

    let needsManualReview = false;
    let manualReason: string | undefined;

    if (!itemsSnapshot) {
      needsManualReview = true;
      manualReason = "Missing items_json snapshot (cannot map items -> products).";
    }

    // Customer/shipping
    const anyS = s as any;
    const customerEmail = s.customer_details?.email ?? undefined;
    const customerName = s.customer_details?.name ?? undefined;
    const customerPhone = s.customer_details?.phone ?? undefined;
    const billingAddress = (s.customer_details?.address as any) ?? undefined;

    const shippingDetails = anyS.shipping_details ?? null;
    const shippingName = (shippingDetails?.name as string | undefined) ?? customerName ?? undefined;
    const shippingPhone = (shippingDetails?.phone as string | undefined) ?? customerPhone ?? undefined;
    const shippingAddress =
      (shippingDetails?.address as any) ?? (s.customer_details?.address as any) ?? undefined;

    const stripeSessionRaw = anyS ?? undefined;

    const snapshotProductIds = (itemsSnapshot ?? []).map((x) => x.productId).filter(isUuid);

    const prows =
      snapshotProductIds.length > 0
        ? await db
            .select({
              id: products.id,
              title: products.title,
              status: products.status,
              quantity: products.quantity,
            })
            .from(products)
            .where(inArray(products.id, snapshotProductIds))
        : [];

    const byId = new Map(prows.map((p) => [p.id, p]));
    const imageById =
      snapshotProductIds.length > 0 ? await getPrimaryImages(snapshotProductIds) : new Map<string, string>();

    const dbItems: Array<{
      productId?: string;
      title: string;
      unitPriceCents: number;
      qty: number;
      lineTotalCents: number;
      imageUrl?: string;
    }> = [];

    if (itemsSnapshot) {
      for (const it of itemsSnapshot) {
        const qty = Math.max(1, Math.min(99, Number(it.qty) || 1));
        const unit = Number(it.unitCents ?? 0);
        const lineTotal = unit * qty;

        const pid = isUuid(it.productId) ? it.productId : undefined;
        const p = pid ? byId.get(pid) ?? null : null;

        if (!p) {
          needsManualReview = true;
          manualReason = manualReason || "Some productIds could not be found in DB.";
        } else if (p.status !== "active") {
          needsManualReview = true;
          manualReason = manualReason || "Some products are not active.";
        } else if (Number(p.quantity ?? 0) < qty) {
          needsManualReview = true;
          manualReason = manualReason || "Stock validation failed (insufficient quantity).";
        }

        dbItems.push({
          ...(pid ? { productId: pid } : {}),
          title: (p?.title ?? it.title) || "Item",
          unitPriceCents: unit,
          qty,
          lineTotalCents: lineTotal,
          imageUrl: pid ? imageById.get(pid) ?? undefined : undefined,
        });
      }
    } else {
      for (const it of displayItems) {
        dbItems.push({
          title: it.title,
          unitPriceCents: it.unit,
          qty: it.qty,
          lineTotalCents: it.lineTotal,
        });
      }
    }

    const orderId = randomUUID();
    const adminOrderUrl = `${getBaseUrl()}/admin/orders/${orderId}`;

    await db.transaction(async (tx) => {
      await tx.insert(orders).values({
        id: orderId,
        cartId,
        stripeSessionId,
        stripePaymentIntentId: paymentIntentId,

        status: "paid",
        currency,

        subtotalCents,
        taxCents: 0,
        shippingCents: 0,
        totalCents,

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
        dbItems.map((it) => ({
          orderId,
          ...(it.productId ? { productId: it.productId } : {}),
          title: it.title,
          unitPriceCents: it.unitPriceCents,
          qty: it.qty,
          lineTotalCents: it.lineTotalCents,
          imageUrl: it.imageUrl ?? undefined,
        }))
      );

      if (itemsSnapshot && !needsManualReview) {
        for (const it of itemsSnapshot) {
          if (!isUuid(it.productId)) continue;
          await tx
            .update(products)
            .set({
              quantity: sql`${products.quantity} - ${Number(it.qty)}`,
              updatedAt: sql`now()`,
            })
            .where(eq(products.id, it.productId));
        }
      }

      if (cartId) {
        try {
          await tx
            .update(carts)
            .set({ status: sql`'checked_out'`, updatedAt: sql`now()` } as any)
            .where(eq(carts.id, cartId));
        } catch {
          // ignore
        }
      }
    });

    // Notifications (never block webhook)
    try {
      await notifyDiscordSale({
        severity: needsManualReview ? "warning" : "success",
        orderId,
        stripeSessionId,
        paymentIntentId,
        currency,
        totalCents,
        itemCount: dbItems.length,
        customerEmail,
        needsManualReview,
        reason: needsManualReview ? manualReason : undefined,
        adminOrderUrl,
      });
    } catch (e) {
      console.error("[discord notify] failed", e);
    }

    try {
      await notifySaleEmail({
        orderId,
        stripeSessionId,
        currency,
        totalCents,
        customerEmail,
        customerName,
        shippingName,
        needsManualReview,
        items: dbItems.map((n) => ({
          title: n.title,
          qty: n.qty,
          unit: n.unitPriceCents,
          lineTotal: n.lineTotalCents,
        })),
      });
    } catch (e) {
      console.error("[sale notify] email failed", e);
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    console.error("[stripe webhook] handler failed", e);

    // red discord (best effort)
    try {
      await notifyDiscordSale({
        severity: "error",
        reason: e?.message ? String(e.message) : "Webhook handler threw an error.",
      });
    } catch {}

    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
