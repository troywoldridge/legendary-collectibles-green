import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { carts, cartLines } from "@/lib/db/schema/cart";
import { products } from "@/lib/db/schema/shop";
import { and, eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const CART_COOKIE = "lc_cart_id";

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

async function getOrCreateCartId(): Promise<string> {
  const jar = await cookies();
  const existingId = jar.get(CART_COOKIE)?.value;

  if (existingId && isUuid(existingId)) {
    const row = await db.select({ id: carts.id }).from(carts).where(eq(carts.id, existingId)).limit(1);
    if (row.length) return existingId;
  }

  // ✅ Drizzle in your repo: returning() takes NO args
  const created = await db.insert(carts).values({ status: "open" as any }).returning();
  const cartId = (created as any)?.[0]?.id as string | undefined;
  if (!cartId) throw new Error("Failed to create cart");

  jar.set(CART_COOKIE, cartId, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return cartId;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const productId = (body?.productId as string | undefined)?.trim();
    const quantity = Math.max(1, Math.min(99, Number(body?.quantity ?? 1)));

    if (!productId || !isUuid(productId)) return json({ error: "Invalid productId" }, 400);

    const p = await db
      .select({ id: products.id, status: products.status })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    if (!p.length) return json({ error: "Product not found" }, 404);
    if (p[0].status !== "active") return json({ error: "Product is not available" }, 400);

    const cartId = await getOrCreateCartId();

    await db
      .insert(cartLines)
      .values({
        cartId,
        listingId: productId,
        qty: quantity,
      })
      .onConflictDoUpdate({
        target: [cartLines.cartId, cartLines.listingId],
        set: {
          qty: sql`${cartLines.qty} + ${quantity}`,
          updatedAt: sql`now()`,
        },
      });

    return json({ ok: true, cartId });
  } catch (err: any) {
    console.error("[api/cart/add] failed:", err?.message ?? err, err);
    return json({ error: "Failed to add to cart" }, 500);
  }
}
