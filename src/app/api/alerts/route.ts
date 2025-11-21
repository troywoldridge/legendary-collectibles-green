/* eslint-disable @typescript-eslint/no-unused-vars */
// POST /api/alerts  (create)
// GET  /api/alerts  (list)
import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { priceAlerts } from "@/lib/db/schema/priceAlerts";
import { and, eq } from "drizzle-orm";
import { getUserPlan } from "@/lib/plans";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json([], { status: 200 });

  const rows = await db
    .select()
    .from(priceAlerts)
    .where(eq(priceAlerts.userId, userId));

  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json();
  const { game, cardId, source, ruleType, threshold } = body;

  // Plan gating: alerts require Collector+
  const plan = await getUserPlan(userId);
  if (!plan.features.trendsAndMovers && !plan.features.advancedLtvTools) {
    return NextResponse.json(
      { error: "Upgrade required for price alerts." },
      { status: 403 }
    );
  }

  const row = await db
    .insert(priceAlerts)
    .values({
      userId,
      game,
      cardId,
      source,
      ruleType,
      threshold,
    })
    .returning();

  return NextResponse.json(row[0]);
}
