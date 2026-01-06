// src/app/api/cart/count/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { cart_lines } from "@/lib/db/schema/cart";
import { eq, sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CART_COOKIE = "lc_cart_id";

export async function GET() {
  const jar = await cookies();
  const cartId = jar.get(CART_COOKIE)?.value;

  if (!cartId) return NextResponse.json({ count: 0 });

  const rows = await db
    .select({
      count: sql<number>`coalesce(sum(${cart_lines.qty}), 0)`,
    })
    .from(cart_lines)
    .where(eq(cart_lines.cart_id, cartId));

  return NextResponse.json({ count: Number(rows?.[0]?.count ?? 0) });
}
