/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getUserPlan } from "@/lib/plans";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = (await db.execute(sql`
    SELECT id, game, target_card_id AS card_id, source, rule_type, threshold, active, created_at, last_triggered_at
    FROM price_alerts
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `)).rows as any[];

  return NextResponse.json({ alerts: rows });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // src/app/api/pro/alerts/route.ts

  const plan = await getUserPlan(userId);

  // Use maxItemsTotal here, not maxItems
  const maxItemsTotal = plan?.limits?.maxItemsTotal ?? 0;

  if (maxItemsTotal <= 0) {
    return NextResponse.json({ error: "Pro required" }, { status: 402 });
  }


  const body = await req.json().catch(() => ({}));
  const game = String(body?.game ?? "");
  const cardId = String(body?.cardId ?? "");
  const source = String(body?.source ?? "");
  const ruleType = String(body?.ruleType ?? "");
  const thresholdNum = Number(body?.threshold);

  if (!["yugioh", "pokemon", "mtg"].includes(game)) {
    return NextResponse.json({ error: "Invalid game" }, { status: 400 });
  }
  if (
    !cardId ||
    !["tcgplayer", "cardmarket", "ebay", "amazon", "coolstuffinc"].includes(source) ||
    !["above", "below"].includes(ruleType) ||
    !Number.isFinite(thresholdNum)
  ) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const inserted = (await db.execute(sql`
    INSERT INTO price_alerts (user_id, game, target_card_id, source, rule_type, threshold, active)
    VALUES (${userId}, ${game}, ${cardId}, ${source}, ${ruleType}, ${thresholdNum}, true)
    RETURNING id
  `)).rows as any[];

  return NextResponse.json({ id: inserted?.[0]?.id ?? null });
}

export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await db.execute(sql`
    DELETE FROM price_alerts
    WHERE id = ${id} AND user_id = ${userId}
  `);

  return NextResponse.json({ ok: true });
}
