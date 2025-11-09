// src/app/api/billing/create-checkout-session/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Plan = "collector" | "pro";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // Your SDK type demands this literal:
  apiVersion: "2025-10-29.clover",
});

function baseUrl(): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3001";
}

function resolveLineItems(plan: Plan): Stripe.Checkout.SessionCreateParams.LineItem[] | null {
  if (plan === "collector" && process.env.STRIPE_PRICE_COLLECTOR_MONTHLY) {
    return [{ price: process.env.STRIPE_PRICE_COLLECTOR_MONTHLY, quantity: 1 }];
  }
  if (plan === "pro" && process.env.STRIPE_PRICE_PRO_MONTHLY) {
    return [{ price: process.env.STRIPE_PRICE_PRO_MONTHLY, quantity: 1 }];
  }
  return null;
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    // 303 prevents re-POST on redirect
    return NextResponse.redirect(new URL("/sign-in", req.url), 303);
  }

  // Accept <form> POST or JSON fetch
  let plan: Plan | null = null;
  const ctype = req.headers.get("content-type") || "";

  if (ctype.includes("application/json")) {
    try {
      const body = (await req.json()) as unknown;
      const raw = body && typeof body === "object" ? (body as Record<string, unknown>).plan : null;
      const s = String(raw ?? "");
      plan = s === "collector" || s === "pro" ? s : null;
    } catch {
      plan = null;
    }
  } else {
    const form = await req.formData();
    const s = String(form.get("plan") ?? "");
    plan = s === "collector" || s === "pro" ? s : null;
  }

  if (!plan) {
    return NextResponse.redirect(new URL("/pricing?error=plan", req.url), 303);
  }

  const lineItems = resolveLineItems(plan);
  if (!lineItems) {
    return NextResponse.redirect(new URL(`/pricing?error=env_${plan}`, req.url), 303);
  }

  const base = baseUrl();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: lineItems,
    // keep user linkage; you’ll handle this in your webhook
    client_reference_id: userId,
    metadata: { userId, plan },
    success_url: `${base}/post-auth`,
    cancel_url: `${base}/pricing?canceled=1`,
    automatic_tax: { enabled: true },
    // Optional niceties:
    // customer_creation: "if_required",
    // allow_promotion_codes: true,
  });

  return NextResponse.redirect(session.url!, 303);
}
