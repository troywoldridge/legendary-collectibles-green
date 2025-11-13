/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { auth, clerkClient } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Env guard */
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

/** Build absolute base URL from request headers or APP_URL fallback */
function getBaseUrlFromRequest(req: NextRequest): string {
  const fromEnv = process.env.APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  const h = req.headers;
  const proto = h.get("x-forwarded-proto") ?? (req.nextUrl.protocol.replace(":", "") || "https");
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

async function createSessionForUser(userId: string, baseUrl: string) {
  const STRIPE_SECRET_KEY = requireEnv("STRIPE_SECRET_KEY");
  const STRIPE_PRICE_PRO = requireEnv("STRIPE_PRICE_PRO"); // should be a TEST recurring price for test runs
  const stripe = new Stripe(STRIPE_SECRET_KEY);

  // --- Optional preflight: catch the #1 error (wrong price or wrong mode) ---
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
    // If this throws “No such price”, you grabbed a LIVE id while using a TEST key (or vice-versa).
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
    // Bubble a clear message upward so handler can return it to you
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
    const { userId } = await auth();
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
    // ⚠️ During bring-up, return the actual message so you can see it:
    const msg = err?.raw?.message || err?.message || "Failed to start checkout";
    console.error("[create-checkout-session] error:", msg, {
      type: err?.type,
      code: err?.code,
      raw: err?.raw,
      stack: err?.stack,
    });
    // Use 400 for most Stripe validation errors so you see the text in the response
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
