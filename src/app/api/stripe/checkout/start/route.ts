/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function baseUrlFromReq(req: NextRequest) {
  const env = process.env.APP_URL?.trim();
  if (env) return env.replace(/\/+$/, "");
  const h = req.headers;
  const proto = h.get("x-forwarded-proto") ?? (req.nextUrl.protocol.replace(":", "") || "https");
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? req.nextUrl.host ?? "localhost:3000";
  return `${proto}://${host}`.replace(/\/+$/, "");
}

// GET /api/stripe/checkout/start?mode=subscription&plan=pro|collector|collector_plus
export async function GET(req: NextRequest) {
  const STRIPE_SECRET_KEY = requireEnv("STRIPE_SECRET_KEY");
  const stripe = new Stripe(STRIPE_SECRET_KEY);

  try {
    const base = baseUrlFromReq(req);
    const sp = req.nextUrl.searchParams;

    const mode = (sp.get("mode") ?? "subscription").toLowerCase() as "subscription" | "payment";
    const plan = (sp.get("plan") ?? (mode === "subscription" ? "pro" : "")).toLowerCase();
    const qty = Number(sp.get("qty") ?? "1") || 1;

    // Env price mapping (TEST values while you’re trialing)
    const PLAN_TO_PRICE: Record<string, string | undefined> = {
      collector: process.env.STRIPE_PRICE_COLLECTOR,
      collector_plus: process.env.STRIPE_PRICE_COLLECTOR_PLUS,
      pro: process.env.STRIPE_PRICE_PRO,
    };

    const priceFromQuery = sp.get("price") ?? undefined;
    const price = priceFromQuery ?? (mode === "subscription" ? PLAN_TO_PRICE[plan] : undefined);

    if (!price) {
      throw new Error(
        "Missing price. Pass ?price=price_xxx or set STRIPE_PRICE_PRO / STRIPE_PRICE_COLLECTOR / STRIPE_PRICE_COLLECTOR_PLUS."
      );
    }

    // Sanity check the price type vs mode
    const p = await stripe.prices.retrieve(price);
    if (mode === "subscription" && p.type !== "recurring") {
      throw new Error(`Price ${price} is ${p.type}. Subscriptions require a recurring price.`);
    }
    if (mode === "payment" && p.type !== "one_time") {
      throw new Error(`Price ${price} is ${p.type}. One-time payments require a one_time price.`);
    }

    // ✅ Landing page on success: /pricing/success
    const planForUrl = plan || "pro";
    const success_url = `${base}/pricing/success?plan=${encodeURIComponent(
      planForUrl
    )}&sid={CHECKOUT_SESSION_ID}`;

    // Canceled: back to pricing with flag
    const cancel_url = `${base}/pricing?canceled=1`;

    const session = await stripe.checkout.sessions.create({
      mode,
      line_items: [{ price, quantity: qty }],
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      success_url,
      cancel_url,
      ...(plan
        ? {
            metadata: { plan: planForUrl },
            ...(mode === "subscription"
              ? { subscription_data: { metadata: { plan: planForUrl } } }
              : {}),
          }
        : {}),
    });

    if (!session.url) throw new Error("Stripe Checkout did not return a URL");

    // 🔁 303 redirect straight to Stripe — no JSON for customers
    return NextResponse.redirect(session.url, { status: 303 });
  } catch (err: any) {
    const msg = err?.raw?.message || err?.message || String(err);
    console.error("[checkout:start] error:", msg, {
      type: err?.type,
      code: err?.code,
      raw: err?.raw,
    });
    return NextResponse.json(
      { error: msg },
      { status: /missing|price|recurring|one_time/i.test(msg) ? 400 : 500 }
    );
  }
}
