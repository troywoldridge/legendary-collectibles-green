import "server-only";

import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";

type CheckoutEvent = {
  eventType: string;
  userId?: string | null;
  cartId?: string | null;
  email?: string | null;

  subtotalCents?: number;
  shippingCents?: number;
  taxCents?: number;
  totalCents?: number;

  metadata?: unknown;
};

function getHeader(name: string) {
  try {
    return headers().get(name) ?? null;
  } catch {
    return null;
  }
}

export async function logCheckoutEvent(evt: CheckoutEvent) {
  try {
    const ip =
      getHeader("cf-connecting-ip") ||
      getHeader("x-forwarded-for")?.split(",")[0]?.trim() ||
      getHeader("x-real-ip") ||
      null;

    const userAgent = getHeader("user-agent");

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
        ${String(evt.eventType || "").trim() || "unknown"},
        ${evt.userId ?? null},
        ${evt.cartId ?? null},
        ${evt.email ?? null},
        ${Number.isFinite(evt.subtotalCents as any) ? Math.max(0, Math.floor(evt.subtotalCents as any)) : null},
        ${Number.isFinite(evt.shippingCents as any) ? Math.max(0, Math.floor(evt.shippingCents as any)) : null},
        ${Number.isFinite(evt.taxCents as any) ? Math.max(0, Math.floor(evt.taxCents as any)) : null},
        ${Number.isFinite(evt.totalCents as any) ? Math.max(0, Math.floor(evt.totalCents as any)) : null},
        ${ip},
        ${userAgent},
        ${JSON.stringify(evt.metadata ?? {})}::jsonb
      )
    `);
  } catch (err) {
    // never block checkout due to analytics failures
    console.error("[checkout-analytics-error]", err);
  }
}
