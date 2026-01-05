import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { cart_lines } from "@/lib/db/schema/cart";
import { and, eq, sql } from "drizzle-orm";

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

export async function POST(req: Request) {
  try {
    const jar = await cookies();
    const cartId = jar.get(CART_COOKIE)?.value;

    if (!cartId || !isUuid(cartId)) return json({ error: "No active cart" }, 400);

    const body = await req.json().catch(() => null);
    const lineId = Number(body?.lineId);
    const qty = Number(body?.qty);

    if (!Number.isFinite(lineId) || lineId < 1) return json({ error: "Invalid lineId" }, 400);
    if (!Number.isFinite(qty) || qty < 0) return json({ error: "Invalid qty" }, 400);

    if (qty === 0) {
      await db
        .delete(cart_lines)
        .where(and(eq(cart_lines.id, lineId), eq(cart_lines.cart_id, cartId))); // ✅ cart_id
      return json({ ok: true, removed: true });
    }

    // ✅ Drizzle in your repo: returning() takes NO args
    const updated = await db
      .update(cart_lines)
      .set({
        qty,
        updated_at: sql`now()`, // ✅ updated_at
      })
      .where(and(eq(cart_lines.id, lineId), eq(cart_lines.cart_id, cartId))) // ✅ cart_id
      .returning();

    if (!updated.length) return json({ error: "Line not found" }, 404);

    return json({ ok: true, lineId, qty: (updated as any)[0].qty });
  } catch (err) {
    console.error("[api/cart/update] failed", err);
    return json({ error: "Failed to update cart" }, 500);
  }
}
