// src/app/api/cart/clear/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { cart_lines } from "@/lib/db/schema/cart";
import { eq } from "drizzle-orm";

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

export async function POST() {
  try {
    const jar = await cookies();
    const cartId = jar.get(CART_COOKIE)?.value?.trim();

    if (!cartId || !isUuid(cartId)) return json({ error: "No active cart" }, 400);

    await db.delete(cart_lines).where(eq(cart_lines.cart_id, cartId));
    return json({ ok: true, cleared: true });
  } catch (err) {
    console.error("[api/cart/clear] failed", err);
    return json({ error: "Failed to clear cart" }, 500);
  }
}
