// src/app/api/collection/funko/add/route.ts
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

  const purchasePriceCentsRaw = body?.purchasePriceCents;
  const purchasePriceCents =
    purchasePriceCentsRaw === null || purchasePriceCentsRaw === undefined || purchasePriceCentsRaw === ""
      ? null
      : Math.max(0, toInt(purchasePriceCentsRaw, 0, 50_000_000));

  const notes = norm(body?.notes);
  const notesOut = notes ? notes.slice(0, 2000) : null;

  // Ensure item exists (nice error vs FK failure)
  const exists = await db.execute(sql`
    select 1
    from funko_items
    where id = ${funkoItemId}
    limit 1;
  `);
  if (!((exists as any).rows?.length)) {
    return NextResponse.json(
      { ok: false, error: "not_found", message: "Funko item not found." },
      { status: 404 },
    );
  }

  const res = await db.execute(sql`
    insert into funko_collection_items (
      user_id,
      funko_item_id,
      list_type,
      qty,
      purchase_price_cents,
      notes,
      created_at,
      updated_at
    )
    values (
      ${userId},
      ${funkoItemId},
      ${listType},
      ${qty},
      ${purchasePriceCents},
      ${notesOut},
      now(),
      now()
    )
    on conflict (user_id, funko_item_id, list_type)
    do update set
      qty = funko_collection_items.qty + excluded.qty,
      purchase_price_cents = coalesce(excluded.purchase_price_cents, funko_collection_items.purchase_price_cents),
      notes = coalesce(excluded.notes, funko_collection_items.notes),
      updated_at = now()
    returning
      id as "collectionId",
      user_id as "userId",
      funko_item_id as "funkoItemId",
      list_type as "listType",
      qty,
      purchase_price_cents as "purchasePriceCents",
      notes,
      created_at as "createdAt",
      updated_at as "updatedAt";
  `);

  return NextResponse.json({ ok: true, item: (res as any).rows?.[0] ?? null });
}
