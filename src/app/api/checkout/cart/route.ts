// src/app/api/checkout/cart/route.ts
import "server-only";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CheckoutCartItem = {
  lineId: number;
  listingId: string;
  qty: number;

  id: string;
  slug: string | null;
  title: string;
  subtitle: string | null;

  priceCents: number;
  compareAtCents: number | null;

  sealed: boolean | null;
  isGraded: boolean | null;
  grader: string | null;
  gradeX10: number | null;
  condition: string | null;

  quantity: number | null;
  imageUrl: string | null;
};

async function buildCheckoutCart() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cartRes = await db.execute(
    sql<{ id: string }>`
      select id
      from carts
      where user_id = ${userId}
        and coalesce(status, 'open') = 'open'
      order by updated_at desc nulls last, created_at desc
      limit 1
    `,
  );

  const cartId = cartRes.rows?.[0]?.id ?? null;
  if (!cartId) {
    return NextResponse.json({ cartId: null, items: [], subtotalCents: 0 }, { status: 200 });
  }

  const linesRes = await db.execute(
    sql<CheckoutCartItem>`
      select
        cl.id as "lineId",
        cl.listing_id as "listingId",
        cl.qty as "qty",

        p.id as "id",
        p.slug as "slug",
        p.title as "title",
        p.subtitle as "subtitle",

        p.price_cents as "priceCents",
        p.compare_at_cents as "compareAtCents",

        p.sealed as "sealed",
        p.is_graded as "isGraded",
        p.grader as "grader",
        p.grade_x10 as "gradeX10",
        p.condition as "condition",

        p.quantity as "quantity",
        p.image_url as "imageUrl"
      from cart_lines cl
      join products p
        on p.id = cl.listing_id
      where cl.cart_id = ${cartId}
        and cl.listing_id is not null
      order by cl.id asc
    `,
  );

  const items = (linesRes.rows ?? []).map((r) => ({
    lineId: Number(r.lineId),
    listingId: String(r.listingId),
    qty: Number(r.qty),

    productId: String(r.id),
    slug: r.slug ?? null,
    title: r.title,
    subtitle: r.subtitle ?? null,

    unitPriceCents: Number(r.priceCents ?? 0),
    compareAtCents: r.compareAtCents == null ? null : Number(r.compareAtCents),

    sealed: r.sealed ?? null,
    isGraded: r.isGraded ?? null,
    grader: r.grader ?? null,
    gradeX10: r.gradeX10 == null ? null : Number(r.gradeX10),
    condition: r.condition ?? null,

    availableQty: r.quantity == null ? null : Number(r.quantity),
    image: r.imageUrl ? { url: r.imageUrl, alt: r.title ?? null } : null,

    lineTotalCents: Number(r.priceCents ?? 0) * Number(r.qty ?? 0),
  }));

  const subtotalCents = items.reduce((sum, it) => sum + (it.lineTotalCents ?? 0), 0);

  return NextResponse.json({ cartId, items, subtotalCents }, { status: 200 });
}

export async function GET() {
  try {
    return await buildCheckoutCart();
  } catch (err) {
    console.error("[api/checkout/cart] error", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// ✅ your button is POSTing, so support it
export async function POST() {
  try {
    return await buildCheckoutCart();
  } catch (err) {
    console.error("[api/checkout/cart] error", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
