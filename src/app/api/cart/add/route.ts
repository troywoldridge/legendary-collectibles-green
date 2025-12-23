import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

import { carts } from "@/lib/db/schema";
import { products } from "@/lib/db/schema/shop";

export const dynamic = "force-dynamic";

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

async function getOrCreateCartId(): Promise<string> {
  const jar = await cookies();
  let cartId = jar.get("lc_cart_id")?.value ?? null;

  if (cartId) {
    const existing = await db.execute(sql`select id from carts where id = ${cartId} limit 1`);
    const rows = (existing as any)?.rows ?? [];
    if (rows.length) return cartId;
  }

  cartId = crypto.randomUUID();

  await db.execute(sql`
    insert into carts (id, status, created_at, updated_at)
    values (${cartId}, 'active', now(), now())
  `);

  jar.set("lc_cart_id", cartId, {
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
    const productId = body?.productId as string | undefined;
    const quantity = Number(body?.quantity ?? 1);

    if (!productId) return json({ error: "Missing productId" }, 400);
    if (!Number.isFinite(quantity) || quantity < 1) return json({ error: "Invalid quantity" }, 400);

    // confirm product exists + active
    const p = await db
      .select({ id: products.id })
      .from(products)
      .where(sql`${products.id} = ${productId}::uuid and ${products.status} = 'active'`)
      .limit(1);

    if (!p.length) return json({ error: "Product not found" }, 404);

    const cartId = await getOrCreateCartId();

    await db.execute(sql`
      insert into cart_lines (cart_id, product_uuid, qty, created_at, updated_at)
      values (${cartId}, ${productId}::uuid, ${quantity}, now(), now())
      on conflict (cart_id, product_uuid)
      do update set
        qty = cart_lines.qty + excluded.qty,
        updated_at = now()
    `);

    return json({ ok: true, cartId });
  } catch (err: any) {
    // Log the real PG error so we can see it in pm2 logs
    console.error("[cart/add] failed:", err?.message ?? err, err);
    return json({ error: "Failed to add to cart" }, 500);
  }
}
