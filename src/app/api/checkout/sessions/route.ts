// src/app/api/checkout/sessions/route.ts
import "server-only";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

import { baseShippingCentsForWeight } from "@/lib/shipping/rates";
import { insuranceCentsForShipment } from "@/lib/shipping/insurance";

// ✅ correct import (DB writer)
import { logCheckoutEvent } from "@/lib/analytics/logCheckoutEvent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const CART_COOKIE = "lc_cart_id";

function s(v: unknown): string {
  return String(v ?? "").trim();
}
function n(v: unknown, fallback = 0): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}
function toInt(v: unknown, def = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? Math.floor(x) : def;
}
function toBool(v: unknown, def = false) {
  if (typeof v === "boolean") return v;
  const str = String(v ?? "").trim().toLowerCase();
  if (str === "true" || str === "1" || str === "yes") return true;
  if (str === "false" || str === "0" || str === "no") return false;
  return def;
}
function toNumber(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

function getSiteUrl() {
  return s(
    process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.SITE_URL ||
      "https://legendary-collectibles.com",
  ).replace(/\/+$/, "");
}

function getStripe() {
  const key = s(process.env.STRIPE_SECRET_KEY);
  if (!key) throw new Error("Stripe not configured (missing STRIPE_SECRET_KEY)");
  return new Stripe(key, { apiVersion: "2025-10-29.clover" });
}

type CartRow = { id: string; user_id: string | null };

type LineRow = {
  productId: string;
  qty: number;
  title: string;
  priceCents: number;
  slug: string | null;
  shippingWeightLbs: number | null;
  shippingClass: string | null;
};

async function readJsonBody(req: Request) {
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("application/json")) return null;
  return await req.json().catch(() => null);
}

function errMeta(code: string, message: string, extra?: Record<string, unknown>) {
  return { code, message, ...(extra || {}) };
}

export async function POST(req: Request) {
  const startedAt = Date.now();

  // Optional auth (guest allowed)
  let userId: string | null = null;
  try {
    const a = await auth();
    userId = a?.userId || null;
  } catch {
    userId = null;
  }

  const jar = await cookies();
  const cookieCartId = s(jar.get(CART_COOKIE)?.value);

  const FREE_SHIPPING_THRESHOLD_CENTS = toInt(
    process.env.FREE_SHIPPING_THRESHOLD_CENTS,
    15000,
  );
  const ALLOW_INTERNATIONAL = toBool(process.env.ALLOW_INTERNATIONAL, false);

  // Optional: allow client to pass email (nice for guests), but not required
  const body = await readJsonBody(req);
  const customerEmail = s(body?.email) || null;

  // 1) determine cartId (cookie first, then signed-in user's open cart)
  let cartId = "";
  try {
    if (cookieCartId && isUuid(cookieCartId)) {
      cartId = cookieCartId;
    } else if (userId) {
      const cartRes = await db.execute<CartRow>(sql`
        select id, user_id
        from carts
        where user_id = ${userId}
          and coalesce(status, 'open') = 'open'
        order by updated_at desc nulls last, created_at desc
        limit 1
      `);

      cartId = s(cartRes.rows?.[0]?.id);
    }
  } catch (e: any) {
    await logCheckoutEvent(
      {
        eventType: "checkout_failed",
        userId,
        cartId: cookieCartId || null,
        email: customerEmail,
        metadata: errMeta("cart_lookup_failed", s(e?.message || e)),
      },
      req,
    );
    return NextResponse.json({ error: "No active cart" }, { status: 400 });
  }

  // ✅ checkout_started
  await logCheckoutEvent(
    {
      eventType: "checkout_started",
      userId,
      cartId: cartId || (cookieCartId || null),
      email: customerEmail,
      metadata: {
        msFromStart: Date.now() - startedAt,
        isGuest: !userId,
        hasEmail: Boolean(customerEmail),
        source: "api/checkout/sessions",
      },
    },
    req,
  );

  if (!cartId || !isUuid(cartId)) {
    await logCheckoutEvent(
      {
        eventType: "checkout_failed",
        userId,
        cartId: cartId || (cookieCartId || null),
        email: customerEmail,
        metadata: errMeta("no_active_cart", "No active cart (missing/invalid cartId)"),
      },
      req,
    );
    return NextResponse.json({ error: "No active cart" }, { status: 400 });
  }

  try {
    const stripe = getStripe();
    const SITE_URL = getSiteUrl();

    // 1.1) validate cart exists + open, and is not someone else’s cart (if signed in)
    const cartCheck = await db.execute<CartRow>(sql`
      select id, user_id
      from carts
      where id = ${cartId}::uuid
        and coalesce(status, 'open') = 'open'
      limit 1
    `);

    const cartRow = cartCheck.rows?.[0];
    if (!cartRow?.id) {
      await logCheckoutEvent(
        {
          eventType: "checkout_failed",
          userId,
          cartId,
          email: customerEmail,
          metadata: errMeta("cart_not_found", "Cart not found or not open"),
        },
        req,
      );
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
    }

    const cartOwner = s(cartRow.user_id);
    if (userId && cartOwner && cartOwner !== userId) {
      await logCheckoutEvent(
        {
          eventType: "checkout_failed",
          userId,
          cartId,
          email: customerEmail,
          metadata: errMeta("forbidden_cart", "Signed-in user does not own this cart"),
        },
        req,
      );
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 2) purchasable lines
    const linesRes = await db.execute<LineRow>(sql`
      select
        p.id as "productId",
        cl.qty as "qty",
        p.title as "title",
        p.price_cents as "priceCents",
        p.slug as "slug",
        p.shipping_weight_lbs as "shippingWeightLbs",
        p.shipping_class as "shippingClass"
      from cart_lines cl
      join products p on p.id = cl.listing_id
      where cl.cart_id = ${cartId}::uuid
        and cl.listing_id is not null
        and p.price_cents is not null
        and p.price_cents > 0
        and p.status = 'active'::product_status
        and p.quantity > 0
      order by cl.id asc
    `);

    const rows = linesRes.rows ?? [];
    if (!rows.length) {
      await logCheckoutEvent(
        {
          eventType: "checkout_failed",
          userId,
          cartId,
          email: customerEmail,
          metadata: errMeta("no_purchasable_items", "No purchasable items in cart"),
        },
        req,
      );
      return NextResponse.json(
        { error: "No purchasable items in cart" },
        { status: 400 },
      );
    }

    // subtotal + weight + insurance
    let subtotalCents = 0;
    let totalWeight = 0;

    const insuranceItems: Array<{ shippingClass?: string | null; qty?: number | null }> = [];

    for (const r of rows) {
      const qty = Math.max(1, Math.min(99, n(r.qty, 1)));
      const unit = Math.max(0, n(r.priceCents, 0));
      subtotalCents += qty * unit;

      const shippingClass = r.shippingClass ? String(r.shippingClass) : null;
      const w = toNumber(r.shippingWeightLbs);

      const sc = String(shippingClass || "").toLowerCase();
      const fallbackW =
        sc === "graded"
          ? 0.5
          : sc === "etb"
            ? 2.0
            : sc === "booster_box"
              ? 3.0
              : sc === "accessory"
                ? 0.5
                : 0.25;

      totalWeight += (w > 0 ? w : fallbackW) * qty;
      insuranceItems.push({ shippingClass, qty });
    }

    const freeShipping = subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS;
    const baseShippingCents = freeShipping ? 0 : baseShippingCentsForWeight(totalWeight);
    const insuranceCents = insuranceCentsForShipment(insuranceItems);

    // Stripe line_items
    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = rows.map((r) => {
      const qty = Math.max(1, Math.min(99, n(r.qty, 1)));
      const unitAmount = Math.max(1, n(r.priceCents, 0));
      const title = s(r.title) || "Item";

      return {
        quantity: qty,
        price_data: {
          currency: "usd",
          unit_amount: unitAmount,
          product_data: { name: title },
        },
      };
    });

    // shipping line item
    line_items.push({
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: Math.max(0, Math.floor(baseShippingCents)),
        product_data: {
          name: freeShipping ? "Shipping (Free)" : "Shipping (USPS Ground Advantage)",
          metadata: {
            model: "weight_tiers",
            weight_lbs: String(Number(totalWeight.toFixed(2))),
          },
        },
      },
    });

    // insurance line item
    if (insuranceCents > 0) {
      line_items.push({
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.max(0, Math.floor(insuranceCents)),
          product_data: {
            name: "Insurance (Graded Card Coverage)",
            metadata: { model: "graded_rule" },
          },
        },
      });
    }

    const allowed_countries: Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[] =
      ALLOW_INTERNATIONAL ? ["US", "CA"] : ["US"];

    const items_json = JSON.stringify(
      rows.map((r) => ({
        productId: String(r.productId),
        qty: Math.max(1, n(r.qty, 1)),
        unitCents: Math.max(0, n(r.priceCents, 0)),
        title: s(r.title) || "Item",
        shippingClass: r.shippingClass ? String(r.shippingClass) : null,
        shippingWeightLbs: r.shippingWeightLbs ? Number(r.shippingWeightLbs) : null,
      })),
    );

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,

      ...(customerEmail ? { customer_email: customerEmail } : {}),

      shipping_address_collection: { allowed_countries },

      billing_address_collection: "required",
      automatic_tax: { enabled: true },

      success_url: `${SITE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/cart/review`,

      metadata: {
        cartId: String(cartId),
        userId: userId ?? "",
        isGuest: String(!userId),
        items_json,
        subtotalCents: String(Math.max(0, Math.floor(subtotalCents))),
        shippingModel: "weight_tiers+insurance_line_items",
        freeShippingThresholdCents: String(FREE_SHIPPING_THRESHOLD_CENTS),

        weightLbs: String(Number(totalWeight.toFixed(2))),
        baseShippingCents: String(Math.floor(baseShippingCents)),
        insuranceCents: String(Math.floor(insuranceCents)),
        freeShipping: String(Boolean(freeShipping)),
      },
    });

    const url = session.url;
    if (!url) {
      await logCheckoutEvent(
        {
          eventType: "checkout_failed",
          userId,
          cartId,
          email: customerEmail,
          subtotalCents,
          shippingCents: Math.floor(baseShippingCents + insuranceCents),
          totalCents: Math.floor(subtotalCents + baseShippingCents + insuranceCents),
          metadata: errMeta("stripe_missing_url", "Checkout failed: missing Stripe URL"),
        },
        req,
      );

      return NextResponse.json(
        { error: "Checkout failed: missing Stripe URL" },
        { status: 500 },
      );
    }

    // ✅ checkout_redirected
    await logCheckoutEvent(
      {
        eventType: "checkout_redirected",
        userId,
        cartId,
        email: customerEmail,
        subtotalCents,
        shippingCents: Math.floor(baseShippingCents + insuranceCents),
        taxCents: null,
        totalCents: null,
        metadata: {
          msFromStart: Date.now() - startedAt,
          stripeSessionId: String(session.id || ""),
          weightLbs: Number(totalWeight.toFixed(2)),
          freeShipping: Boolean(freeShipping),
          baseShippingCents: Math.floor(baseShippingCents),
          insuranceCents: Math.floor(insuranceCents),
        },
      },
      req,
    );

    const accept = (req.headers.get("accept") || "").toLowerCase();
    const wantsHtml = accept.includes("text/html");

    if (wantsHtml) {
      return NextResponse.redirect(url, 303);
    }

    return NextResponse.json({ url }, { status: 200 });
  } catch (err: any) {
    const msg = s(err?.message || err) || "Internal Server Error";

    await logCheckoutEvent(
      {
        eventType: "checkout_failed",
        userId,
        cartId: cartId || null,
        email: customerEmail,
        metadata: errMeta("exception", msg, {
          name: s(err?.name),
          stack: s(err?.stack)?.slice(0, 2000) || null,
        }),
      },
      req,
    );

    console.error("[api/checkout/sessions] error", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
