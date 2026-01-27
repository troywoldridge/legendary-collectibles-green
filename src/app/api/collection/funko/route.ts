// src/app/api/collection/funko/route.ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function norm(v: unknown) {
  return String(v ?? "").trim();
}

function toInt(v: unknown, fallback: number, max: number) {
  const n = Number(String(v ?? ""));
  if (!Number.isFinite(n)) return fallback;
  const m = Math.floor(n);
  if (m < 0) return fallback;
  return Math.min(m, max);
}

function normListType(v: unknown): "owned" | "wishlist" | "for_sale" | "" {
  const s = norm(v).toLowerCase();
  if (!s) return "";
  if (s === "owned" || s === "wishlist" || s === "for_sale") return s;
  return "";
}

function getAdminToken(req: NextRequest) {
  return (req.headers.get("x-admin-token") || req.headers.get("X-Admin-Token") || "").trim();
}

function hasValidAdminToken(req: NextRequest) {
  const want = (process.env.ADMIN_TOKEN || "").trim();
  if (!want) return false;
  const got = getAdminToken(req);
  return !!got && got === want;
}

async function getEffectiveUserId(req: NextRequest): Promise<string | null> {
  // 1) Normal Clerk auth
  const { userId } = await auth();
  if (userId) return userId;

  // 2) Admin token impersonation
  if (hasValidAdminToken(req)) {
    const uid = norm(req.headers.get("x-user-id") || req.headers.get("X-User-Id"));
    return uid || null;
  }

  return null;
}

export async function GET(req: NextRequest) {
  const userId = await getEffectiveUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const listType = normListType(url.searchParams.get("list_type"));
  const limit = Math.max(1, toInt(url.searchParams.get("limit"), 50, 200));
  const offset = toInt(url.searchParams.get("offset"), 0, 5000);

  const rows = await db.execute(sql`
    select
      c.id as "collectionId",
      c.user_id as "userId",
      c.funko_item_id as "funkoItemId",
      c.list_type as "listType",
      c.qty,
      c.purchase_price_cents as "purchasePriceCents",
      c.notes,
      c.created_at as "createdAt",
      c.updated_at as "updatedAt",

      f.name,
      f.franchise,
      f.series,
      f.line,
      f.number,
      f.edition,
      f.variant,
      f.is_chase as "isChase",
      f.is_exclusive as "isExclusive",
      f.exclusivity,
      f.release_year as "releaseYear",
      f.upc,
      f.image_small as "imageSmall",
      f.image_large as "imageLarge",
      f.source,
      f.source_id as "sourceId"
    from funko_collection_items c
    join funko_items f on f.id = c.funko_item_id
    where
      c.user_id = ${userId}
      and (${listType} = '' or c.list_type = ${listType})
    order by c.updated_at desc
    limit ${limit} offset ${offset};
  `);

  const countRes = await db.execute(sql`
    select count(*)::int as total
    from funko_collection_items c
    where
      c.user_id = ${userId}
      and (${listType} = '' or c.list_type = ${listType});
  `);

  return NextResponse.json({
    ok: true,
    listType: listType || null,
    limit,
    offset,
    total: Number((countRes as any).rows?.[0]?.total ?? 0),
    items: (rows as any).rows ?? [],
  });
}
