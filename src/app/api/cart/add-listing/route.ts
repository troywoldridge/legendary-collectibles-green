// src/app/api/cart/add-listing/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

type Body = { listingId: string; quantity?: number };

async function getOrCreateCartIdForUser(userId: string) {
  const existing = await db.execute<{ cart_id: string }>(sql`
    SELECT cart_id
    FROM public.cart_users
    WHERE user_id = ${userId}
    LIMIT 1
  `);

  const cartId = existing.rows?.[0]?.cart_id;
  if (cartId) return cartId;

  // create cart row
  const createdCart = await db.execute<{ id: string }>(sql`
    INSERT INTO public.carts (id, status, created_at, updated_at)
    VALUES (gen_random_uuid(), 'open', NOW(), NOW())
    RETURNING id
  `);

  const newCartId = createdCart.rows?.[0]?.id;
  if (!newCartId) return null;

  // link to user
  await db.execute(sql`
    INSERT INTO public.cart_users (user_id, cart_id, created_at, updated_at)
    VALUES (${userId}, ${newCartId}::uuid, NOW(), NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET cart_id = EXCLUDED.cart_id, updated_at = NOW()
  `);

  return newCartId;
}

export async function POST(req: Request) {
  const { userId } = await auth();

  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const listingId = (body.listingId || "").trim();
  const quantity = Math.max(1, Math.min(99, Number(body.quantity ?? 1)));

  if (!listingId) {
    return NextResponse.json({ error: "listingId is required" }, { status: 400 });
  }

  const cartId = await getOrCreateCartIdForUser(userId);
  if (!cartId) return NextResponse.json({ error: "Failed to create cart" }, { status: 500 });

  const listingRes = await db.execute<{
    id: string;
    title: string;
    status: string;
    price_cents: number;
    currency: string;
    quantity: number;
  }>(sql`
    SELECT id, title, status, price_cents, currency, quantity
    FROM public.store_listings
    WHERE id = ${listingId}::uuid
    LIMIT 1
  `);

  const listing = listingRes.rows?.[0];
  if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  if (listing.status !== "active") {
    return NextResponse.json({ error: "Listing is not active" }, { status: 400 });
  }
  if (listing.quantity <= 0) {
    return NextResponse.json({ error: "Out of stock" }, { status: 400 });
  }

  // Upsert by (cart_id, listing_id) — you DO NOT currently have a unique index for this.
  // So we do a safe "update then insert" pattern.
  const updated = await db.execute(sql`
    UPDATE public.cart_lines
    SET qty = LEAST(${listing.quantity}, qty + ${quantity}),
        updated_at = NOW()
    WHERE cart_id = ${cartId}::uuid
      AND listing_id = ${listingId}::uuid
  `);

  // drizzle execute may not return rowCount in a stable way across drivers;
  // simplest: check existence then insert if missing
  const existsRes = await db.execute<{ id: number }>(sql`
    SELECT id
    FROM public.cart_lines
    WHERE cart_id = ${cartId}::uuid
      AND listing_id = ${listingId}::uuid
    LIMIT 1
  `);

  const exists = !!existsRes.rows?.[0]?.id;

  if (!exists) {
    await db.execute(sql`
      INSERT INTO public.cart_lines (cart_id, listing_id, qty, created_at, updated_at)
      VALUES (${cartId}::uuid, ${listingId}::uuid, LEAST(${listing.quantity}, ${quantity}), NOW(), NOW())
    `);
  }

  return NextResponse.json({ ok: true });
}
