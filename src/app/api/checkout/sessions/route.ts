// src/app/api/checkout/sessions/route.ts
import "server-only";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

import { baseShippingCentsForWeight } from "@/lib/shipping/rates";
import { insuranceCentsForShipment } from "@/lib/shipping/insurance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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

function getSiteUrl() {
  return s(
    process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.SITE_URL ||
      "https://legendary-collectibles.com"
  ).replace(/\/+$/, "");
}

function getStripe() {
  const key = s(process.env.STRIPE_SECRET_KEY);
  if (!key) throw new Error("Stripe not configured (missing STRIPE_SECRET_KEY)");
  return new Stripe(key, { apiVersion: "2025-10-29.clover" });
}

type CartRow = { id: string };

type LineRow = {
  productId: string;
  qty: number;
  title: string;
  priceCents: number;
  slug: string | null;
  shippingWeightLbs: number | null;
  shippingClass: string | null;
};

export async function POST(req: Request) {
  try {
    const stripe = getStripe();
    const SITE_URL = getSiteUrl();

    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const FREE_SHIPPING_THRESHOLD_CENTS = toInt(
      process.env.FREE_SHIPPING_THRESHOLD_CENTS,
      15000
    );
    const ALLOW_INTERNATIONAL = toBool(process.env.ALLOW_INTERNATIONAL, false);

    // 1) active cart for this user
    const cartRes = await db.execute<CartRow>(sql`
      select id
      from carts
      where user_id = ${userId}
        and coalesce(status, 'open') = 'open'
      order by updated_at desc nulls last, created_at desc
      limit 1
    `);

    const cartId = s(cartRes.rows?.[0]?.id);
    if (!cartId) {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
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
      return NextResponse.json(
        { error: "No purchasable items in cart" },
        { status: 400 }
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
      }))
    );

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,

      // Collect address
      shipping_address_collection: { allowed_countries },

      // Stripe Tax
      billing_address_collection: "required",
      automatic_tax: { enabled: true },

      success_url: `${SITE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/cart/review`,

      metadata: {
        cartId: String(cartId),
        userId: String(userId),
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
      return NextResponse.json(
        { error: "Checkout failed: missing Stripe URL" },
        { status: 500 }
      );
    }

    // If request came from a normal <form> submit, redirect the browser.
    // If it came from fetch(), return JSON so the client can do window.location.assign().
    const accept = (req.headers.get("accept") || "").toLowerCase();
    const wantsHtml = accept.includes("text/html");

    if (wantsHtml) {
      return NextResponse.redirect(url, 303);
    }

    return NextResponse.json({ url }, { status: 200 });
  } catch (err: any) {
    console.error("[api/checkout/sessions] error", err);
    return NextResponse.json(
      { error: s(err?.message || err) || "Internal Server Error" },
      { status: 500 }
    );
  }
}
