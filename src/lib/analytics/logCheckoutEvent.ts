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

async function getHeader(name: string): Promise<string | null> {
  try {
    const h = await nextHeaders();
    return h.get(name) ?? null;
  } catch {
    return null;
  }
}

function getHeaderFromReq(req: Request | null | undefined, name: string): string | null {
  if (!req) return null;
  try {
    return req.headers.get(name) ?? null;
  } catch {
    return null;
  }
}

function pickIp(req?: Request | null) {
  return (
    getHeaderFromReq(req, "cf-connecting-ip") ||
    getHeaderFromReq(req, "x-forwarded-for")?.split(",")[0]?.trim() ||
    getHeaderFromReq(req, "x-real-ip")
  );
}

/**
 * Preferred usage (best typing + easiest testing):
 *   await logCheckoutEvent(evt, req)
 *
 * Fallback usage (no req available):
 *   await logCheckoutEvent(evt)
 */
export async function logCheckoutEvent(evt: CheckoutEvent, req?: Request): Promise<void> {
  try {
    const ip =
      pickIp(req) ||
      (await getHeader("cf-connecting-ip")) ||
      (await getHeader("x-forwarded-for")) ||
      (await getHeader("x-real-ip"));

    const userAgent =
      getHeaderFromReq(req, "user-agent") ||
      (await getHeader("user-agent"));

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
        ${String(evt.eventType || "")},
        ${evt.userId ?? null},
        ${evt.cartId ?? null},
        ${evt.email ?? null},
        ${evt.subtotalCents ?? null},
        ${evt.shippingCents ?? null},
        ${evt.taxCents ?? null},
        ${evt.totalCents ?? null},
        ${ip ?? null},
        ${userAgent ?? null},
        ${JSON.stringify(evt.metadata ?? {})}::jsonb
      )
    `);
  } catch (err) {
    console.error("[checkout-analytics-error]", err);
  }
}
