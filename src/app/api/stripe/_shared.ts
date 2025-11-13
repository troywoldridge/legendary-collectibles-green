/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";
import Stripe from "stripe";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET_KEY) throw new Error("Missing STRIPE_SECRET_KEY");

export const stripe = new Stripe(STRIPE_SECRET_KEY);

/** Prefer APP_URL, otherwise derive from request headers */
export function baseUrlFromReq(req: NextRequest) {
  const env = process.env.APP_URL?.trim();
  if (env) return env.replace(/\/+$/, "");
  const h = req.headers;
  const proto = h.get("x-forwarded-proto") ?? (req.nextUrl.protocol.replace(":", "") || "https");
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? req.nextUrl.host ?? "localhost:3000";
  return `${proto}://${host}`.replace(/\/+$/, "");
}

/** Safely parse JSON body */
export async function parseJson<T = any>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    // allow empty body
    return {} as T;
  }
}

/** Uniform error response with Stripe detail when present */
export function errorJson(err: any, status = 400) {
  const msg = err?.raw?.message || err?.message || String(err);
  // Log full error server-side for debugging
  console.error("[stripe]", msg, {
    type: err?.type,
    code: err?.code,
    raw: err?.raw,
    stack: err?.stack,
  });
  return Response.json({ error: msg }, { status });
}
