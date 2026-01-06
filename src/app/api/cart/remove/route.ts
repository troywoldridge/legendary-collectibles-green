// src/app/api/cart/remove/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { cart_lines } from "@/lib/db/schema/cart";
import { and, eq } from "drizzle-orm";

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
    const cartId = jar.get(CART_COOKIE)?.value?.trim();

    if (!cartId || !isUuid(cartId)) return json({ error: "No active cart" }, 400);

    const body = await req.json().catch(() => null);
    const lineId = Number(body?.lineId);

    if (!Number.isFinite(lineId) || lineId < 1) {
      return json({ error: "Invalid lineId" }, 400);
    }

    const deleted = await db
      .delete(cart_lines)
      .where(and(eq(cart_lines.id, lineId), eq(cart_lines.cart_id, cartId)))
      .returning();

    if (!deleted.length) return json({ error: "Line not found" }, 404);

    return json({ ok: true, removed: true, lineId });
  } catch (err) {
    console.error("[api/cart/remove] failed", err);
    return json({ error: "Failed to remove item" }, 500);
  }
}
