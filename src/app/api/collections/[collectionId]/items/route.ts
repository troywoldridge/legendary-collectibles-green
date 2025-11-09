// src/app/api/collections/[collectionId]/items/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { collections, collectionItems } from "@/lib/db/schema/collections";
import { and, eq, sql, desc } from "drizzle-orm";
import { getUserPlan, assertLimit } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

type CreateItemBody = Partial<{
  game: "pokemon" | "yugioh" | "magic" | "mtg" | "sports" | string;
  cardId: string;
  quantity: number;
  condition: string | null;
  gradeCompany: string | null;
  grade: string | number | null;
  purchasePriceCents: number | null;
  currency: string | null;
  acquiredAt: string | null; // ISO
  location: string | null;
  notes: string | null;
  // optional snapshots (for UX speed)
  cardName: string | null;
  setName: string | null;
  number: string | null;
  imageUrl: string | null;
}>;

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ collectionId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return bad("Unauthorized", 401);

  const { collectionId } = await ctx.params;

  // Ensure the collection belongs to this user
  const coll = await db
    .select({ id: collections.id })
    .from(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.userId, userId)))
    .limit(1);

  if (!coll[0]) return bad("Not found", 404);

  // List items in that collection (newest first)
  const items = await db
    .select()
    .from(collectionItems)
    .where(eq(collectionItems.collectionId, coll[0].id))
    .orderBy(desc(collectionItems.createdAt));

  return NextResponse.json(items);
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ collectionId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return bad("Unauthorized", 401);

  const { collectionId } = await ctx.params;

  // Ensure the collection belongs to this user
  const coll = await db
    .select({ id: collections.id })
    .from(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.userId, userId)))
    .limit(1);

  if (!coll[0]) return bad("Not found", 404);

  // Safe parse without any
  let body: CreateItemBody = {};
  try {
    const raw = (await req.json()) as unknown;
    if (raw && typeof raw === "object") body = raw as CreateItemBody;
  } catch {
    // ignore bad json
  }

  const game = (body.game ?? "").toString().trim();
  const cardId = (body.cardId ?? "").toString().trim();
  if (!game || !cardId) return bad("Missing game or cardId", 422);

  const quantity = Number.isFinite(body.quantity) ? Number(body.quantity) : 1;

  // Plan limit on items per collection
  const { limits } = await getUserPlan(userId);
  const countRes = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(collectionItems)
    .where(eq(collectionItems.collectionId, coll[0].id));
  const count = countRes[0]?.n ?? 0;

  assertLimit(count, limits.maxItems, "Items");

  const [row] = await db
    .insert(collectionItems)
    .values({
      id: nanoid(12),
      collectionId: coll[0].id,
      game,
      cardId,
      cardName: body.cardName ?? null,
      setName: body.setName ?? null,
      number: body.number ?? null,
      imageUrl: body.imageUrl ?? null,
      quantity,
      condition: body.condition ?? null,
      gradeCompany: body.gradeCompany ?? null,
      grade: body.grade != null ? String(body.grade) : null,
      purchasePriceCents:
        typeof body.purchasePriceCents === "number" ? body.purchasePriceCents : null,
      currency: body.currency ?? "USD",
      acquiredAt: body.acquiredAt ? new Date(body.acquiredAt) : null,
      location: body.location ?? null,
      notes: body.notes ?? null,
    })
    .returning();

  return NextResponse.json(row, { status: 201 });
}
