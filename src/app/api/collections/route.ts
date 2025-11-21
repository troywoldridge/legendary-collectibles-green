// src/app/api/collections/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { collections } from "@/lib/db/schema/collections";
import { eq, sql, desc } from "drizzle-orm";
import { getUserPlan } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateCollectionBody = { name?: string };

export async function GET() {
  const { userId } = await auth(); // <-- must await
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Use select/from instead of db.query.* (no schema barrel dependency)
  const rows = await db
    .select()
    .from(collections)
    .where(eq(collections.userId, userId))
    .orderBy(desc(collections.isDefault), desc(collections.createdAt));

  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const { userId } = await auth(); // <-- must await
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: CreateCollectionBody = {};
  try {
    const raw = (await req.json()) as unknown;
    if (raw && typeof raw === "object") body = raw as CreateCollectionBody;
  } catch {
    // ignore bad JSON; stay with empty body
  }

  const name = (typeof body.name === "string" ? body.name : "").trim() || "My Collection";

  const { limits } = await getUserPlan(userId);

  const countRes = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(collections)
    .where(eq(collections.userId, userId));
  const count = countRes[0]?.n ?? 0;

  

  const [row] = await db
    .insert(collections)
    .values({ id: nanoid(12), userId, name, isDefault: count === 0 })
    .returning();

  return NextResponse.json(row, { status: 201 });
}
