import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { collections, collectionItems } from "@/lib/db/schema/collections";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

type Params = { collectionId: string; itemId: string };

type UpdateItemBody = Partial<{
  quantity: number;
  condition: string | null;
  gradeCompany: string | null;
  grade: string | number | null;
  purchasePriceCents: number | null;
  currency: string | null;
  acquiredAt: string | null; // ISO
  location: string | null;
  notes: string | null;
}>;

type ItemRow = typeof collectionItems.$inferSelect;

async function ensureOwnership(
  userId: string,
  collectionId: string,
  itemId: string
): Promise<{ ok: true; item: ItemRow } | { ok: false; status: 403 | 404 }> {
  const coll = await db
    .select({ id: collections.id })
    .from(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.userId, userId)))
    .limit(1);
  if (!coll[0]) return { ok: false, status: 404 };

  const item = await db
    .select()
    .from(collectionItems)
    .where(and(eq(collectionItems.id, itemId), eq(collectionItems.collectionId, collectionId)))
    .limit(1);
  if (!item[0]) return { ok: false, status: 404 };

  return { ok: true, item: item[0] };
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<Params> }
) {
  const { userId } = await auth();
  if (!userId) return bad("Unauthorized", 401);

  const { collectionId, itemId } = await ctx.params;
  const guard = await ensureOwnership(userId, collectionId, itemId);
  if (!guard.ok) return bad("Not found", guard.status);

  return NextResponse.json(guard.item);
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<Params> }
) {
  const { userId } = await auth();
  if (!userId) return bad("Unauthorized", 401);

  const { collectionId, itemId } = await ctx.params;
  const guard = await ensureOwnership(userId, collectionId, itemId);
  if (!guard.ok) return bad("Not found", guard.status);

  let body: UpdateItemBody = {};
  try {
    const raw = (await req.json()) as unknown;
    if (raw && typeof raw === "object") body = raw as UpdateItemBody;
  } catch {
    // ignore bad json
  }

  const values: Partial<typeof collectionItems.$inferInsert> = {};
  if (typeof body.quantity === "number") values.quantity = body.quantity;
  if ("condition" in body) values.condition = body.condition ?? null;
  if ("gradeCompany" in body) values.gradeCompany = body.gradeCompany ?? null;
  if ("grade" in body) values.grade = body.grade == null ? null : String(body.grade);
  if (typeof body.purchasePriceCents === "number") values.purchasePriceCents = body.purchasePriceCents;
  if ("currency" in body) values.currency = body.currency ?? null;
  if ("acquiredAt" in body) values.acquiredAt = body.acquiredAt ? new Date(body.acquiredAt) : null;
  if ("location" in body) values.location = body.location ?? null;
  if ("notes" in body) values.notes = body.notes ?? null;

  const [row] = await db
    .update(collectionItems)
    .set(values)
    .where(and(eq(collectionItems.id, itemId), eq(collectionItems.collectionId, collectionId)))
    .returning();

  return NextResponse.json(row);
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<Params> }
) {
  const { userId } = await auth();
  if (!userId) return bad("Unauthorized", 401);

  const { collectionId, itemId } = await ctx.params;
  const guard = await ensureOwnership(userId, collectionId, itemId);
  if (!guard.ok) return bad("Not found", guard.status);

  await db
    .delete(collectionItems)
    .where(and(eq(collectionItems.id, itemId), eq(collectionItems.collectionId, collectionId)));

  return NextResponse.json({ ok: true });
}
