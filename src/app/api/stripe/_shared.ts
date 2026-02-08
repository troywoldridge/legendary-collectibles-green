// src/app/api/stripe/_shared.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

import Stripe from "stripe";
import { NextRequest } from "next/server";

// NOTE:
// Do NOT read env vars or construct Stripe clients at module scope.
// Next may evaluate/import this file during build/route analysis ("collect page data").
// Keep everything request-time (inside functions) to avoid build-time crashes.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampStr(s: string, max = 500) {
  const t = String(s ?? "");
  return t.length > max ? t.slice(0, max) + "…" : t;
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    const e: any = new Error("Stripe not configured");
    e.status = 500;
    throw e;
  }

  // If you want to pin an API version, do it here (request-time), not at import-time.
  // return new Stripe(key, { apiVersion: "2024-06-20" as any });
  return new Stripe(key);
}

/** Prefer APP_URL, otherwise derive from request headers */
export function baseUrlFromReq(req: NextRequest) {
  const env = process.env.APP_URL?.trim();
  if (env) return env.replace(/\/+$/, "");

  const h = req.headers;
  const proto =
    h.get("x-forwarded-proto") ??
    (req.nextUrl.protocol?.replace(":", "") || "https");
  const host =
    h.get("x-forwarded-host") ??
    h.get("host") ??
    req.nextUrl.host ??
    "localhost:3000";

  return `${proto}://${host}`.replace(/\/+$/, "");
}

/** Safely parse JSON body (handles empty body + bad JSON cleanly) */
export async function parseJson<T = any>(req: NextRequest): Promise<T> {
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

function isStripeNotFound(err: any): boolean {
  return Boolean(err && (err.statusCode === 404 || err.code === "resource_missing"));
}

/** Uniform error response without leaking secrets */
export function errorJson(err: any, status = 400) {
  const derivedStatus =
    Number(err?.status) ||
    Number(err?.statusCode) ||
    (isStripeNotFound(err) ? 404 : status);

  const safeMsg =
    err?.message === "Stripe not configured"
      ? "Stripe is not configured on server"
      : derivedStatus === 404
      ? "Not found"
      : derivedStatus === 400
      ? "Bad request"
      : "Unexpected server error";

  // Log full error server-side for debugging (but don't leak to client).
  console.error("[stripe]", clampStr(err?.message || String(err)), {
    type: err?.type,
    code: err?.code,
    statusCode: err?.statusCode,
    stack: err?.stack,
  });

  return Response.json({ error: safeMsg }, { status: derivedStatus });
}

/**
 * Optional convenience helper: call Stripe while keeping env usage inside handler.
 * Usage:
 *   const stripe = getStripe();
 *   const x = await stripe.checkout.sessions.retrieve(...)
 */
