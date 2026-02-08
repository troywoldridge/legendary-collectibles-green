// src/app/api/stripe/checkout/sessions/[id]/route.ts
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

function isStripeNotFound(err: any): boolean {
  return Boolean(err && (err.statusCode === 404 || err.code === "resource_missing"));
}

function getStripe(): Stripe {
  // IMPORTANT: read env + create Stripe ONLY at request time (never at module scope)
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    const e: any = new Error("Stripe not configured");
    e.status = 500;
    throw e;
  }
  return new Stripe(key);
}

async function parseJson<T>(req: NextRequest): Promise<T> {
  // Defensive JSON parsing: empty body -> {}
  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    // Still allow clients that forget the header, but do not crash.
    // If body isn't JSON, this will throw and be handled.
  }

  const text = await req.text();
  if (!text.trim()) return {} as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    const e: any = new Error("Invalid JSON body");
    e.status = 400;
    throw e;
  }
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

function toPublicStripeError(err: any, fallbackStatus: number): Response {
  // Avoid leaking raw Stripe error objects/messages.
  // Map common cases to sane, stable responses.
  const status =
    Number(err?.status) ||
    Number(err?.statusCode) ||
    (isStripeNotFound(err) ? 404 : fallbackStatus);

  if (status === 404) return json(404, { error: "Checkout session not found" });
  if (status === 400) return json(400, { error: err?.message || "Bad request" });
  if (status === 401 || status === 403) return json(status, { error: "Unauthorized" });

  if (err?.message === "Stripe not configured") {
    return json(500, { error: "Stripe is not configured on server" });
  }

  return json(500, { error: "Unexpected server error" });
}

// GET /api/stripe/checkout/sessions/[id]
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> } // 👈 Promise (match your Next typing)
): Promise<Response> {
  try {
    const { id } = await context.params;

    const sessionId = validateSessionId(id);
    if (!sessionId) return json(400, { error: "Invalid checkout session id" });

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return json(200, session);
  } catch (err: any) {
    console.error("GET /checkout/sessions/[id] error:", err);
    return toPublicStripeError(err, 404);
  }
}

// POST /api/stripe/checkout/sessions/[id] (update)
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> } // 👈 Promise (match your Next typing)
): Promise<Response> {
  try {
    const { id } = await context.params;

    const sessionId = validateSessionId(id);
    if (!sessionId) return json(400, { error: "Invalid checkout session id" });

    const body = await parseJson<any>(req);

    // Guardrail: block attempts to set obviously dangerous/unexpected keys, if desired.
    // (Stripe will validate too, but this keeps error responses cleaner.)
    if (body && typeof body !== "object") {
      return json(400, { error: "Body must be a JSON object" });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.update(sessionId, body);
    return json(200, session);
  } catch (err: any) {
    console.error("POST /checkout/sessions/[id] error:", err);
    return toPublicStripeError(err, 400);
  }
}
