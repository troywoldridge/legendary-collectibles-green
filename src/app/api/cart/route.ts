// src/app/api/cart/route.ts
import "server-only";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { eq, inArray } from "drizzle-orm";

import { carts, cart_lines, products } from "@/lib/db/schema";
import { auth, currentUser } from "@clerk/nextjs/server";
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

async function getOrCreateCartId(): Promise<string> {
  const jar = await cookies(); // ✅ async in your Next version
  const existing = jar.get(CART_COOKIE)?.value?.trim();
  if (existing) return existing;

  const id = randomUUID();

  await db.insert(carts).values({
    id,
    status: "open",
  });

  jar.set(CART_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });

  return id;
}

export async function GET() {
  try {
    const cartId = await getOrCreateCartId();

    // Best-effort attach user/email (do not require auth)
    try {
      const a = await auth(); // ✅ async in your Clerk setup
      const userId = a?.userId || null;

      if (userId) {
        const u = await currentUser().catch(() => null);
        const email = u?.emailAddresses?.[0]?.emailAddress || null;

        await db
          .update(carts)
          .set({
            user_id: userId,
            email,
            updated_at: new Date(),
          })
          .where(eq(carts.id, cartId));
      }
    } catch {
      // ignore
    }

    // Load cart lines
    const lines = await db
      .select({
        id: cart_lines.id,
        qty: cart_lines.qty, // ✅ your table likely uses qty (NOT quantity)
        listingId: cart_lines.listing_id,
      })
      .from(cart_lines)
      .where(eq(cart_lines.cart_id, cartId));

    const listingIds = lines
      .map((l) => l.listingId)
      .filter((x): x is string => typeof x === "string" && x.length > 0);

    const prodRows =
      listingIds.length > 0
        ? await db
            .select({
              id: products.id,
              slug: products.slug,
              title: products.title,
              priceCents: products.priceCents,
              compareAtCents: products.compareAtCents,
              sealed: products.sealed,
              isGraded: products.isGraded,
              grader: products.grader,
              gradeX10: products.gradeX10,
              condition: products.condition,
              inventoryType: products.inventoryType,
              quantity: products.quantity,
              // imageUrl: products.imageUrl, // ❌ doesn’t exist in your schema
            })
            .from(products)
            .where(inArray(products.id, listingIds))
        : [];

    const prodById = new Map(prodRows.map((p) => [p.id, p]));

    const items = lines
      .map((l) => {
        const pid = l.listingId || null;
        if (!pid) return null;

        const p = prodById.get(pid);
        if (!p) return null;

        const unitPriceCents = toInt((p as any).priceCents, 0);
        const qty = Math.max(1, toInt(l.qty, 1));

        return {
          lineId: l.id,
          productId: p.id,
          slug: (p as any).slug ?? null,
          title: (p as any).title ?? null,
          qty,
          unitPriceCents,
          lineTotalCents: unitPriceCents * qty,
          compareAtCents: (p as any).compareAtCents ?? null,
          sealed: !!(p as any).sealed,
          isGraded: !!(p as any).isGraded,
          grader: (p as any).grader ?? null,
          gradeX10: (p as any).gradeX10 ?? null,
          condition: (p as any).condition ?? null,
          inventoryType: (p as any).inventoryType ?? null,
          availableQty: (p as any).quantity ?? null,
          image: null,
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
