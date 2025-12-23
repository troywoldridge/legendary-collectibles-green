// src/app/api/cart/remove/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db/index";
import { carts, cartLines } from "@/lib/db/schema/cart";
import { and, eq, sql } from "drizzle-orm";

const CART_COOKIE = "lc_cart_id";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function POST(req: Request) {
  try {
    const jar = await cookies();
    const cartId = jar.get(CART_COOKIE)?.value;

    if (!cartId || !isUuid(cartId)) {
      return NextResponse.json({ error: "No active cart" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const lineId = Number.parseInt(String(body.lineId ?? ""), 10);

    if (!Number.isFinite(lineId) || lineId <= 0) {
      return NextResponse.json({ error: "Invalid lineId" }, { status: 400 });
    }

    await db
      .delete(cartLines)
      .where(and(eq(cartLines.id, lineId), eq(cartLines.cartId, cartId)));

    await db.update(carts).set({ updatedAt: sql`now()` }).where(eq(carts.id, cartId));

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[api/cart/remove] error", err);
    return NextResponse.json({ error: "Failed to remove item" }, { status: 500 });
  }
}
