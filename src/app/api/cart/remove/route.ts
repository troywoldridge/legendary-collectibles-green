import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

const CART_COOKIE = "lc_cart_id";
export const dynamic = "force-dynamic";

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function POST(req: Request) {
  try {
    const jar = await cookies();
    const cartId = jar.get(CART_COOKIE)?.value;

    if (!cartId || !isUuid(cartId)) return json({ error: "No active cart" }, 400);

    const body = await req.json().catch(() => null);
    const lineId = Number(body?.lineId);

    if (!Number.isFinite(lineId) || lineId < 1) return json({ error: "Invalid lineId" }, 400);

    await db.execute(sql`
      delete from cart_lines
      where id = ${lineId} and cart_id = ${cartId}::uuid
    `);

    return json({ ok: true });
  } catch (err) {
    console.error("[cart/remove] failed", err);
    return json({ error: "Failed to remove from cart" }, 500);
  }
}
