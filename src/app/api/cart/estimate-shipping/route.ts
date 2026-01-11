import "server-only";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { baseShippingCentsForWeight } from "@/lib/shipping/rates";
import { insuranceCentsForShipment } from "@/lib/shipping/insurance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function toInt(v: unknown, fallback = 0): number {
  const n = Math.floor(toNumber(v));
  return Number.isFinite(n) ? n : fallback;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Pick the most recently updated open cart for this user
  const cartRes = await db.execute(sql`
    SELECT id
    FROM carts
    WHERE user_id = ${userId}
      AND status = 'open'
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 1
  `);

  let cartId = (cartRes as any)?.rows?.[0]?.id as string | undefined;

if (!cartId) {
  // Create a new open cart for this user
  const created = await db.execute(sql`
    INSERT INTO carts (user_id, status)
    VALUES (${userId}, 'open')
    RETURNING id
  `);

  cartId = (created as any)?.rows?.[0]?.id as string | undefined;

  // Still paranoid-safe fallback
  if (!cartId) {
    return NextResponse.json(
      { error: "Failed to create cart" },
      { status: 500 }
    );
  }
}


  // Pull line items by listing_id (UUID FK to products)
  // Only include rows that have listing_id set.
  const linesRes = await db.execute(sql`
    SELECT
      cl.qty,
      p.shipping_weight_lbs,
      p.shipping_class
    FROM cart_lines cl
    JOIN products p ON p.id = cl.listing_id
    WHERE cl.cart_id = ${cartId}
      AND cl.listing_id IS NOT NULL
  `);

  const lines: any[] = (linesRes as any)?.rows ?? [];

  let totalWeight = 0;
  const insuranceItems: Array<{ shippingClass?: string | null; qty?: number | null }> = [];

  for (const r of lines) {
    const qty = Math.max(1, toInt(r.qty, 1));
    const w = toNumber(r.shipping_weight_lbs);
    const shippingClass = r.shipping_class ? String(r.shipping_class) : null;

    // If weight missing in DB, we can fallback by class to avoid 0-weight quotes.
    const fallbackW =
      String(shippingClass || "").toLowerCase() === "graded" ? 0.5 :
      String(shippingClass || "").toLowerCase() === "etb" ? 2.0 :
      String(shippingClass || "").toLowerCase() === "booster_box" ? 3.0 :
      String(shippingClass || "").toLowerCase() === "accessory" ? 0.5 :
      0.25;

    totalWeight += (w > 0 ? w : fallbackW) * qty;
    insuranceItems.push({ shippingClass, qty });
  }

  const base = baseShippingCentsForWeight(totalWeight);
  const insurance = insuranceCentsForShipment(insuranceItems);
  const total = base + insurance;

  return NextResponse.json({
    cart_id: cartId,
    weight_lbs: Number(totalWeight.toFixed(2)),
    base_shipping_cents: base,
    insurance_cents: insurance,
    total_shipping_cents: total,
  });
}
