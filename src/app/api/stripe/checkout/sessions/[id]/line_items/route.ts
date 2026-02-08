// src/app/api/stripe/checkout/sessions/[id]/line_items/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

import { NextRequest } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function clampInt(n: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(n)) return fallback;
  const x = Math.floor(n);
  if (x < min) return min;
  if (x > max) return max;
  return x;
}

function validateSessionId(id: unknown): string | null {
  if (typeof id !== "string") return null;
  const s = id.trim();
  if (!s) return null;
  if (s.length < 6 || s.length > 255) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  if (!/^cs_/.test(s)) return null;
  return s;
}

function getStripe(): Stripe {
  // IMPORTANT: read env + create Stripe ONLY at request time
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    // Throw a controlled error; we handle it in the route.
    const e: any = new Error("Stripe not configured");
    e.status = 500;
    throw e;
  }
  return new Stripe(key);
}

function isStripeNotFound(err: any): boolean {
  return Boolean(err && (err.statusCode === 404 || err.code === "resource_missing"));
}

// GET /api/stripe/checkout/sessions/[id]/line_items?limit=10
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> } // match Next's expected typing
): Promise<Response> {
  try {
    const { id } = await context.params;

    const sessionId = validateSessionId(id);
    if (!sessionId) {
      return json(400, { error: "Invalid checkout session id" });
    }

    const rawLimit = Number(req.nextUrl.searchParams.get("limit") ?? "10");
    const limit = clampInt(rawLimit, 1, 100, 10);

    const stripe = getStripe();

    try {
      const items = await stripe.checkout.sessions.listLineItems(sessionId, { limit });
      return json(200, items);
    } catch (err: any) {
      if (isStripeNotFound(err)) {
        return json(404, { error: "Checkout session not found" });
      }
      console.error("Stripe listLineItems error:", err);
      return json(500, { error: "Failed to load line items" });
    }
  } catch (err: any) {
    const status = Number(err?.status) || 500;
    if (status === 500 && err?.message === "Stripe not configured") {
      return json(500, { error: "Stripe is not configured on server" });
    }
    console.error("Route error:", err);
    return json(status, { error: "Unexpected server error" });
  }
}
