import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { carts, cartLines } from "@/lib/db/schema/cart";
import { products, productImages } from "@/lib/db/schema/shop";
import { and, eq, inArray, asc, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const CART_COOKIE = "lc_cart_id";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function GET() {
  try {
    const jar = await cookies();
    const cartId = jar.get(CART_COOKIE)?.value;

    if (!cartId || !isUuid(cartId)) {
      return NextResponse.json({ cartId: null, items: [], subtotalCents: 0 }, { status: 200 });
    }

    const cart = await db.select({ id: carts.id }).from(carts).where(eq(carts.id, cartId)).limit(1);
    if (!cart.length) {
      return NextResponse.json({ cartId, items: [], subtotalCents: 0 }, { status: 200 });
    }

    const lines = await db
      .select({
        lineId: cartLines.id,
        qty: cartLines.qty,
        listingId: cartLines.listingId,
        updatedAt: cartLines.updatedAt,
      })
      .from(cartLines)
      .where(and(eq(cartLines.cartId, cartId), sql`${cartLines.listingId} is not null`));

    const productIds = lines.map((l) => l.listingId).filter(Boolean) as string[];
    if (!productIds.length) {
      return NextResponse.json({ cartId, items: [], subtotalCents: 0 }, { status: 200 });
    }

    const prows = await db
      .select({
        id: products.id,
        title: products.title,
        slug: products.slug,
        priceCents: products.priceCents,
        compareAtCents: products.compareAtCents,
        status: products.status,
        sealed: products.sealed,
        isGraded: products.isGraded,
        grader: products.grader,
        gradeX10: products.gradeX10,
        condition: products.condition,
        inventoryType: products.inventoryType,
        quantity: products.quantity,
      })
      .from(products)
      .where(inArray(products.id, productIds));

    const productById = new Map(prows.map((p) => [p.id, p]));

    const imgs = await db
      .select({
        productId: productImages.productId,
        url: productImages.url,
        alt: productImages.alt,
        sort: productImages.sort,
      })
      .from(productImages)
      .where(inArray(productImages.productId, productIds))
      .orderBy(asc(productImages.productId), asc(productImages.sort));

    const imageByProductId = new Map<string, { url: string; alt: string | null }>();
    for (const img of imgs) {
      if (!imageByProductId.has(img.productId)) {
        imageByProductId.set(img.productId, { url: img.url, alt: img.alt ?? null });
      }
    }

    const items = lines
      .map((l) => {
        const p = l.listingId ? productById.get(l.listingId) : null;
        if (!p) return null;

        const unit = Number(p.priceCents ?? 0);
        const qty = Number(l.qty ?? 0);

        return {
          lineId: l.lineId,
          productId: p.id,
          slug: p.slug,
          title: p.title,
          qty,
          unitPriceCents: unit,
          lineTotalCents: unit * qty,
          compareAtCents: p.compareAtCents ?? null,
          sealed: p.sealed,
          isGraded: p.isGraded,
          grader: p.grader,
          gradeX10: p.gradeX10,
          condition: p.condition,
          inventoryType: p.inventoryType,
          availableQty: p.quantity,
          image: imageByProductId.get(p.id) ?? null,
        };
      })
      .filter(Boolean) as any[];

    const subtotalCents = items.reduce((sum, it) => sum + it.lineTotalCents, 0);

    return NextResponse.json({ cartId, items, subtotalCents }, { status: 200 });
  } catch (err) {
    console.error("[api/cart] error", err);
    return NextResponse.json({ error: "Failed to load cart" }, { status: 500 });
  }
}
