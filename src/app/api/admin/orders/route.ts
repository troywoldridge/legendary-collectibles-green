/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toInt(v: string | null, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const q = (searchParams.get("q") || "").trim();
    const status = (searchParams.get("status") || "").trim(); // optional filter
    const limit = Math.min(100, Math.max(1, toInt(searchParams.get("limit"), 25)));
    const offset = Math.max(0, toInt(searchParams.get("offset"), 0));

    const res = await db.execute(sql`
      select
        o.id::text as id,
        o.status::text as status,
        o.currency,
        o.subtotal_cents as "subtotalCents",
        o.tax_cents as "taxCents",
        o.shipping_cents as "shippingCents",
        o.total_cents as "totalCents",
        o.email,
        o.customer_name as "customerName",
        o.customer_phone as "customerPhone",
        o.shipping_name as "shippingName",
        o.shipping_phone as "shippingPhone",
        o.stripe_session_id as "stripeSessionId",
        o.stripe_payment_intent_id as "stripePaymentIntentId",
        o.created_at as "createdAt",
        o.updated_at as "updatedAt"
      from orders o
      where
        (${status} = '' OR o.status::text = ${status})
        and (
          ${q} = '' OR
          o.id::text ilike ('%' || ${q} || '%') OR
          o.stripe_session_id ilike ('%' || ${q} || '%') OR
          coalesce(o.stripe_payment_intent_id, '') ilike ('%' || ${q} || '%') OR
          coalesce(o.email, '') ilike ('%' || ${q} || '%') OR
          coalesce(o.customer_name, '') ilike ('%' || ${q} || '%') OR
          coalesce(o.shipping_name, '') ilike ('%' || ${q} || '%')
        )
      order by o.created_at desc
      limit ${limit}
      offset ${offset}
    `);

    const rows = (res as any)?.rows ?? [];
    return NextResponse.json({ ok: true, rows, limit, offset });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "orders_list_failed", message: String(err?.message ?? err) },
      { status: 500 },
    );
  }
}
