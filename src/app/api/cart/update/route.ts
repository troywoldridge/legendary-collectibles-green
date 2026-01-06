// src/app/api/cart/update/route.ts
import "server-only";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { and, eq, inArray, sql } from "drizzle-orm";

import { cart_lines } from "@/lib/db/schema/cart";
import { products } from "@/lib/db/schema/shop";

export const dynamic = "force-dynamic";

const CART_COOKIE = "lc_cart_id";

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

function toQty(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(99, Math.floor(n)));
}

export async function POST(req: Request) {
  try {
    const jar = await cookies();
    const cartId = jar.get(CART_COOKIE)?.value?.trim();
    if (!cartId || !isUuid(cartId)) return json({ error: "No active cart" }, 400);

    const body = await req.json().catch(() => null);
    const lineId = Number(body?.lineId);
    const desiredQty = toQty(body?.qty);

    if (!Number.isFinite(lineId) || lineId < 1) return json({ error: "Invalid lineId" }, 400);

    // Load the line (ensures it belongs to this cart)
    const line = await db
      .select({ id: cart_lines.id, productId: cart_lines.listing_id, qty: cart_lines.qty })
      .from(cart_lines)
      .where(and(eq(cart_lines.id, lineId), eq(cart_lines.cart_id, cartId)))
      .limit(1);

    if (!line.length) return json({ error: "Line not found" }, 404);

    const productId = line[0].productId;
    if (!productId) {
      await db.delete(cart_lines).where(eq(cart_lines.id, lineId));
      return json({ ok: true, removed: true, lineId });
    }

    // Load product availability
    const p = await db
      .select({ id: products.id, status: products.status, quantity: products.quantity })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    if (!p.length || p[0].status !== "active") {
      await db.delete(cart_lines).where(eq(cart_lines.id, lineId));
      return json({ ok: true, removed: true, lineId, reason: "inactive" });
    }

    const available = Number(p[0].quantity ?? 0);
    if (!Number.isFinite(available) || available <= 0) {
      await db.delete(cart_lines).where(eq(cart_lines.id, lineId));
      return json({ ok: true, removed: true, lineId, reason: "out_of_stock" });
    }

    // qty=0 means remove line
    if (desiredQty === 0) {
      await db.delete(cart_lines).where(eq(cart_lines.id, lineId));
      return json({ ok: true, removed: true, lineId });
    }

    // Clamp to available
    const finalQty = Math.max(1, Math.min(desiredQty, available));

    const updated = await db
      .update(cart_lines)
      .set({ qty: finalQty, updated_at: sql`now()` })
      .where(and(eq(cart_lines.id, lineId), eq(cart_lines.cart_id, cartId)))
      .returning();

    return json({
      ok: true,
      lineId,
      qty: (updated as any)?.[0]?.qty ?? finalQty,
      available,
      clamped: finalQty !== desiredQty,
    });
  } catch (err) {
    console.error("[api/cart/update] failed", err);
    return json({ error: "Failed to update cart" }, 500);
  }
}
