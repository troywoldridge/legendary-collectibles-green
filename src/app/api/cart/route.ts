// src/app/api/cart/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { asc, eq, inArray, sql } from "drizzle-orm";

import { carts, cart_lines, products } from "@/lib/db/schema";
import { productImages } from "@/lib/db/schema/shop";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CART_COOKIE = "lc_cart_id";

function json(data: any, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

function toInt(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

async function getOrCreateCartId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(CART_COOKIE)?.value?.trim();
  if (existing && isUuid(existing)) return existing;

  const id = randomUUID();
  await db.insert(carts).values({ id, status: "open" });

  jar.set(CART_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });

  return id;
}

// (Optional) handle preflight / odd clients so you never see 405 from OPTIONS
export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function GET() {
  try {
    const cartId = await getOrCreateCartId();

    // Load cart lines
    const rawLines = await db
      .select({
        id: cart_lines.id,
        qty: cart_lines.qty,
        listingId: cart_lines.listing_id,
      })
      .from(cart_lines)
      .where(eq(cart_lines.cart_id, cartId));

    const listingIds = rawLines
      .map((l) => l.listingId)
      .filter((x): x is string => typeof x === "string" && x.length > 0);

    if (listingIds.length === 0) {
      return json({ cartId, items: [], subtotalCents: 0 });
    }

    // Load products referenced by the cart
    const prodRows = await db
      .select({
        id: products.id,
        slug: products.slug,
        title: products.title,
        priceCents: products.priceCents,
        compareAtCents: products.compareAtCents,
        status: products.status,
        quantity: products.quantity,
      })
      .from(products)
      .where(inArray(products.id, listingIds));

    const prodById = new Map(prodRows.map((p) => [p.id, p]));

    // ✅ Self-heal (no transaction): remove invalid/inactive/out-of-stock, clamp qty
    for (const l of rawLines) {
      try {
        const pid = l.listingId;
        if (!pid) {
          await db.delete(cart_lines).where(eq(cart_lines.id, l.id));
          continue;
        }

        const p = prodById.get(pid);
        if (!p || p.status !== "active") {
          await db.delete(cart_lines).where(eq(cart_lines.id, l.id));
          continue;
        }

        const available = Number(p.quantity ?? 0);
        if (!Number.isFinite(available) || available <= 0) {
          await db.delete(cart_lines).where(eq(cart_lines.id, l.id));
          continue;
        }

        const currentQty = Math.max(1, toInt(l.qty, 1));
        const clampedQty = Math.min(currentQty, available);

        if (clampedQty !== currentQty) {
          await db
            .update(cart_lines)
            .set({ qty: clampedQty, updated_at: sql`now()` })
            .where(eq(cart_lines.id, l.id));
        }
      } catch (e) {
        console.error("[api/cart] self-heal failed for line", l?.id, e);
      }
    }

    // Re-load healed lines
    const lines = await db
      .select({
        id: cart_lines.id,
        qty: cart_lines.qty,
        listingId: cart_lines.listing_id,
      })
      .from(cart_lines)
      .where(eq(cart_lines.cart_id, cartId));

    const healedListingIds = lines
      .map((l) => l.listingId)
      .filter((x): x is string => typeof x === "string" && x.length > 0);

    if (healedListingIds.length === 0) {
      return json({ cartId, items: [], subtotalCents: 0 });
    }

    // Images (first by sort)
    const imgRows = await db
      .select({
        productId: productImages.productId,
        url: productImages.url,
        alt: productImages.alt,
        sort: productImages.sort,
      })
      .from(productImages)
      .where(inArray(productImages.productId, healedListingIds as any))
      .orderBy(asc(productImages.productId), asc(productImages.sort));

    const firstImgByProductId = new Map<string, { url: string; alt: string | null }>();
    for (const r of imgRows) {
      const pid = String(r.productId);
      if (!firstImgByProductId.has(pid) && r.url) {
        firstImgByProductId.set(pid, { url: r.url, alt: r.alt ?? null });
      }
    }

    // Build items
    const items = lines
      .map((l) => {
        const pid = l.listingId;
        if (!pid) return null;

        const p = prodById.get(pid);
        if (!p || p.status !== "active") return null;

        const available = Number(p.quantity ?? 0);
        if (!Number.isFinite(available) || available <= 0) return null;

        const unitPriceCents = toInt(p.priceCents, 0);
        const qty = Math.max(1, toInt(l.qty, 1));
        const img = firstImgByProductId.get(pid);

        return {
          lineId: l.id,
          productId: p.id,
          slug: p.slug ?? null,
          title: p.title ?? null,
          qty,
          unitPriceCents,
          lineTotalCents: unitPriceCents * qty,
          compareAtCents: p.compareAtCents ?? null,
          availableQty: p.quantity ?? null,
          image: img?.url ? { url: img.url, alt: img.alt ?? (p.title ?? "") } : null,
        };
      })
      .filter(Boolean) as any[];

    const subtotalCents = items.reduce(
      (sum, it) => sum + (it.unitPriceCents || 0) * (it.qty || 0),
      0
    );

    return json({ cartId, items, subtotalCents });
  } catch (err: any) {
    console.error("[api/cart] error", err);
    return json({ error: err?.message || "Cart error" }, { status: 500 });
  }
}
