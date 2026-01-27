// src/app/api/collection/funko/remove/route.ts
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

function normListType(v: unknown): "owned" | "wishlist" | "for_sale" {
  const s = norm(v).toLowerCase();
  if (s === "wishlist") return "wishlist";
  if (s === "for_sale") return "for_sale";
  return "owned";
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
  const { userId } = await auth();
  if (userId) return userId;

  if (hasValidAdminToken(req)) {
    const uid = norm(req.headers.get("x-user-id") || req.headers.get("X-User-Id"));
    return uid || null;
  }

  return null;
}

export async function POST(req: NextRequest) {
  const userId = await getEffectiveUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const funkoItemId = norm(body?.funkoItemId);
  if (!funkoItemId) {
    return NextResponse.json(
      { ok: false, error: "bad_request", message: "Missing funkoItemId." },
      { status: 400 },
    );
  }

  const listType = normListType(body?.listType);
  const qty = Math.max(1, toInt(body?.qty, 1, 999));

  const currentRes = await db.execute(sql`
    select id, qty
    from funko_collection_items
    where user_id = ${userId}
      and funko_item_id = ${funkoItemId}
      and list_type = ${listType}
    limit 1;
  `);

  const current = (currentRes as any).rows?.[0] ?? null;
  if (!current) {
    return NextResponse.json({ ok: true, removed: false, message: "Nothing to remove." });
  }

  const curQty = Number(current.qty ?? 0);
  const nextQty = curQty - qty;

  if (nextQty <= 0) {
    await db.execute(sql`
      delete from funko_collection_items
      where id = ${current.id};
    `);

    return NextResponse.json({ ok: true, removed: true, deleted: true });
  }

  const upd = await db.execute(sql`
    update funko_collection_items
    set qty = ${nextQty}, updated_at = now()
    where id = ${current.id}
    returning id as "collectionId", qty;
  `);

  return NextResponse.json({
    ok: true,
    removed: true,
    deleted: false,
    item: (upd as any).rows?.[0] ?? null,
  });
}
