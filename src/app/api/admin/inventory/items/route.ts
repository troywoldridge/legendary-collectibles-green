// src/app/api/admin/inventory/items/route.ts
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { inventoryItems } from "@/lib/db/schema/inventory";
import { and, desc, eq, ilike, sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const [{ requireAdmin }, { db }] = await Promise.all([
    import("@/lib/adminAuth"),
    import("@/lib/db"),
  ]);

  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status"); // draft|live|archived
  const game = url.searchParams.get("game");
  const q = (url.searchParams.get("q") || "").trim();

  const where = and(
    status ? eq(inventoryItems.status, status as any) : sql`true`,
    game ? eq(inventoryItems.game, game as any) : sql`true`,
    q ? ilike(inventoryItems.title, `%${q}%`) : sql`true`,
  );

  const items = await db
    .select()
    .from(inventoryItems)
    .where(where)
    .orderBy(desc(inventoryItems.updatedAt))
    .limit(200);

  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const [{ requireAdmin }, { db }] = await Promise.all([
    import("@/lib/adminAuth"),
    import("@/lib/db"),
  ]);

  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  const title = (body?.title || "").trim();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const [item] = await db
    .insert(inventoryItems)
    .values({
      game: (body?.game as any) || "other",
      sku: body?.sku || null,
      title,
      condition: body?.condition || "",
      status: (body?.status as any) || "draft",
      priceCents: Number(body?.priceCents || 0),
      costBasisCents: Number(body?.costBasisCents || 0),
      meta: body?.meta || {},
    })
    .returning();

  return NextResponse.json({ item });
}
