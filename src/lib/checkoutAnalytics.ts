import "server-only";

import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { headers as nextHeaders } from "next/headers";

export type CheckoutEvent = {
  eventType: string;
  userId?: string | null;
  cartId?: string | null;
  email?: string | null;

  subtotalCents?: number | null;
  shippingCents?: number | null;
  taxCents?: number | null;
  totalCents?: number | null;

  metadata?: unknown;
};

function s(v: unknown): string {
  return String(v ?? "").trim();
}

async function readNextHeader(name: string): Promise<string | null> {
  try {
    const h = await nextHeaders();
    return h.get(name) ?? null;
  } catch {
    return null;
  }
}

function readReqHeader(req: Request | undefined, name: string): string | null {
  if (!req) return null;
  try {
    return req.headers.get(name) ?? null;
  } catch {
    return null;
  }
}

async function getHeader(req: Request | undefined, name: string): Promise<string | null> {
  // Prefer request headers when we have them (route handlers / webhooks)
  const v = readReqHeader(req, name);
  if (v != null) return v;

  // Fallback (server components, etc.)
  return await readNextHeader(name);
}

function pickIp(rawXff: string | null): string | null {
  if (!rawXff) return null;
  const first = rawXff.split(",")[0]?.trim();
  return first || null;
}

/**
 * Primary low-level logger
 */
export async function logCheckoutEvent(evt: CheckoutEvent, req?: Request) {
  try {
    const ip =
      (await getHeader(req, "cf-connecting-ip")) ||
      pickIp(await getHeader(req, "x-forwarded-for")) ||
      (await getHeader(req, "x-real-ip"));

    const userAgent = await getHeader(req, "user-agent");

    await db.execute(sql`
      insert into checkout_events (
        event_type,
        user_id,
        cart_id,
        email,
        subtotal_cents,
        shipping_cents,
        tax_cents,
        total_cents,
        ip,
        user_agent,
        metadata
      )
      values (
        ${s(evt.eventType)},
        ${evt.userId ?? null},
        ${evt.cartId ?? null},
        ${evt.email ?? null},
        ${evt.subtotalCents ?? null},
        ${evt.shippingCents ?? null},
        ${evt.taxCents ?? null},
        ${evt.totalCents ?? null},
        ${ip},
        ${userAgent},
        ${sql`${JSON.stringify(evt.metadata ?? {})}::jsonb`}
      )
    `);
  } catch (err) {
    console.error("[checkout-analytics-error]", err);
  }
}

/**
 * Convenience wrappers (optional, but nice)
 */
export async function logCheckoutStarted(args: Omit<CheckoutEvent, "eventType">, req?: Request) {
  return logCheckoutEvent({ ...args, eventType: "checkout_started" }, req);
}

export async function logCheckoutRedirected(args: Omit<CheckoutEvent, "eventType">, req?: Request) {
  return logCheckoutEvent({ ...args, eventType: "checkout_redirected" }, req);
}

export async function logCheckoutFailed(args: Omit<CheckoutEvent, "eventType">, req?: Request) {
  return logCheckoutEvent({ ...args, eventType: "checkout_failed" }, req);
}

/**
 * (Future) payment_failed etc can live here too when you’re ready.
 */
