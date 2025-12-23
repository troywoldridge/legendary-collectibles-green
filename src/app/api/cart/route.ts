// src/app/api/cart/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export async function GET() {
  const { userId } = await auth();


  const cartRes = await db.execute<{ cart_id: string }>(sql`
    SELECT cart_id
    FROM public.cart_users
    WHERE user_id = ${userId}
    LIMIT 1
  `);

  const cartId = cartRes.rows?.[0]?.cart_id ?? null;
  if (!cartId) {
    return NextResponse.json({ cartId: null, lines: [], subtotal_cents: 0, currency: "USD" });
  }

  const linesRes = await db.execute<{
    line_id: number;
    qty: number;
    listing_id: string | null;
    product_id: number | null;

    title: string | null;
    primary_image_url: string | null;
    price_cents: number | null;
    currency: string | null;
    status: string | null;
  }>(sql`
    SELECT
      cl.id AS line_id,
      cl.qty,
      cl.listing_id,
      cl.product_id,

      sl.title,
      sl.primary_image_url,
      sl.price_cents,
      sl.currency,
      sl.status
    FROM public.cart_lines cl
    LEFT JOIN public.store_listings sl
      ON sl.id = cl.listing_id
    WHERE cl.cart_id = ${cartId}::uuid
    ORDER BY cl.id ASC
  `);

  const lines = (linesRes.rows ?? []).map((r) => ({
    id: r.line_id,
    qty: r.qty,
    listingId: r.listing_id,
    title: r.title,
    imageUrl: r.primary_image_url,
    price_cents: r.price_cents ?? 0,
    currency: (r.currency ?? "USD").toUpperCase(),
    status: r.status ?? "active",
    line_total_cents: (r.price_cents ?? 0) * r.qty,
  }));

  const subtotal_cents = lines.reduce((sum, l) => sum + l.line_total_cents, 0);
  const currency = (lines[0]?.currency ?? "USD").toUpperCase();

  return NextResponse.json({ cartId, lines, subtotal_cents, currency });
}
