/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { auth, clerkClient } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function s(v: unknown) {
  return String(v ?? "").trim();
}

/** Env guard */
function requireEnv(name: string): string {
  const v = s(process.env[name]);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

/** Build absolute base URL from request headers or APP_URL fallback */
function getBaseUrlFromRequest(req: NextRequest): string {
  const fromEnv = s(process.env.APP_URL);
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  const h = req.headers;
  const proto =
    h.get("x-forwarded-proto") ??
    (req.nextUrl.protocol ? req.nextUrl.protocol.replace(":", "") : "https") ??
    "https";

  const host =
    h.get("x-forwarded-host") ??
    h.get("host") ??
    req.nextUrl.host ??
    "localhost:3000";

  return `${proto}://${host}`.replace(/\/+$/, "");
}

/** Get a Clerk client that works across versions (object vs async-factory) */
async function getClerkClientCompat(): Promise<any> {
  const cc: any = clerkClient as any;
  return typeof cc === "function" ? await cc() : cc;
}

function getStripe(): Stripe {
  const STRIPE_SECRET_KEY = requireEnv("STRIPE_SECRET_KEY");
  // If you want a pinned API version, do it here:
  return new Stripe(STRIPE_SECRET_KEY, {
    // apiVersion: "2025-10-29.clover",
  });
}

async function createSessionForUser(userId: string, baseUrl: string) {
  const STRIPE_PRICE_PRO = requireEnv("STRIPE_PRICE_PRO"); // recurring price id
  const stripe = getStripe();

  // --- Optional preflight: catch common errors early (wrong price or wrong mode) ---
  try {
    const price = await stripe.prices.retrieve(STRIPE_PRICE_PRO);
    if (price.type !== "recurring") {
      throw new Error(
        `STRIPE_PRICE_PRO (${price.id}) is ${price.type}. For subscriptions it must be 'recurring'.`
      );
    }
    if (price.active === false) {
      throw new Error(`STRIPE_PRICE_PRO (${price.id}) is inactive.`);
    }
  } catch (e: any) {
    const msg = e?.raw?.message || e?.message || String(e);
    console.error("[create-checkout-session] price preflight failed:", msg);
    throw new Error(msg);
  }

  const client = await getClerkClientCompat();
  const user = await client.users.getUser(userId);

  const email = user.emailAddresses?.[0]?.emailAddress;
  const pm = (user.privateMetadata || {}) as Record<string, any>;
  const stripeCustomerId = pm.stripeCustomerId as string | undefined;
  const customer = stripeCustomerId;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: STRIPE_PRICE_PRO, quantity: 1 }],
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      customer,
      customer_email: customer ? undefined : email,
      success_url: `${baseUrl}/pro?checkout=success`,
      cancel_url: `${baseUrl}/pricing?canceled=1`,
      metadata: { userId, plan: "pro" },
      subscription_data: {
        metadata: { userId, plan: "pro" },
      },
    });

    if (!session.url) throw new Error("Stripe Checkout did not return a URL");
    return session.url;
  } catch (e: any) {
    const msg = e?.raw?.message || e?.message || String(e);
    console.error("[create-checkout-session] stripe.create error:", msg, {
      type: e?.type,
      code: e?.code,
      raw: e?.raw,
    });
    throw new Error(msg);
  }
}

/** Shared handler */
async function handler(req: NextRequest) {
  try {
    const a = await auth();
    const userId = a?.userId;
    const base = getBaseUrlFromRequest(req);

    if (!userId) {
      // If not signed in, bounce to Clerk and then back here
      const target = `${base}/sign-in?redirect_url=${encodeURIComponent(
        `${base}/api/billing/create-checkout-session`
      )}`;
      return NextResponse.redirect(target);
    }

    const url = await createSessionForUser(userId, base);

    if (req.method === "GET") {
      return NextResponse.redirect(url, { status: 303 });
    }

    return NextResponse.json({ url });
  } catch (err: any) {
    const msg = err?.raw?.message || err?.message || "Failed to start checkout";
    console.error("[create-checkout-session] error:", msg, {
      type: err?.type,
      code: err?.code,
      raw: err?.raw,
      stack: err?.stack,
    });

    const status = /no such price|mode|recurring|one_time|inactive/i.test(msg) ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function GET(req: NextRequest) {
  return handler(req);
}

export async function POST(req: NextRequest) {
  return handler(req);
}
