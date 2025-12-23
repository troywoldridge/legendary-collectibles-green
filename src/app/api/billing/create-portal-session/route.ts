// src/app/api/billing/create-portal-session/route.ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function getPublicOrigin(req: NextRequest): string {
  // Prefer forwarded headers (Cloudflare / proxies)
  const xfProto = req.headers.get("x-forwarded-proto");
  const xfHost = req.headers.get("x-forwarded-host");

  if (xfHost) {
    const proto = (xfProto || "https").split(",")[0].trim();
    const host = xfHost.split(",")[0].trim();
    return `${proto}://${host}`;
  }

  // Next best: Host header
  const host = req.headers.get("host");
  if (host) {
    // If host is localhost or LAN, prefer http; otherwise https
    const isLocal =
      host.includes("localhost") ||
      host.startsWith("127.0.0.1") ||
      host.startsWith("192.168.") ||
      host.startsWith("10.") ||
      host.startsWith("172.");

    const proto = isLocal ? "http" : "https";
    return `${proto}://${host}`;
  }

  // Final fallback: environment (must NOT include :3001)
  const env =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.CANONICAL_HOST ? `https://${process.env.CANONICAL_HOST}` : "");

  if (env) return env.replace(/\/$/, "");

  // Absolute last resort
  return "https://legendary-collectibles.com";
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecret) {
      return NextResponse.json(
        { error: "Missing STRIPE_SECRET_KEY" },
        { status: 500 },
      );
    }

    const stripe = new Stripe(stripeSecret, {
      apiVersion: "2025-10-29.clover",
    });

    // Parse body safely
    const body = await req.json().catch(() => ({} as any));
    const returnTo: string =
      typeof body?.returnTo === "string" && body.returnTo.trim()
        ? body.returnTo.trim()
        : "/account/billing";

    // IMPORTANT: build return_url from the *public* origin (no :3001)
    const origin = getPublicOrigin(req);
    const returnUrl = new URL(returnTo, origin).toString();

    // NOTE: You likely already have a way you map user -> stripe customer id.
    // If you store it in DB, fetch it here.
    // For now, we expect the client to pass customerId if that's how you built it.
    const customerId: string | undefined =
      typeof body?.customerId === "string" ? body.customerId : undefined;

    if (!customerId) {
      return NextResponse.json(
        { error: "Missing customerId" },
        { status: 400 },
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("[billing portal] error", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to create portal session" },
      { status: 500 },
    );
  }
}
