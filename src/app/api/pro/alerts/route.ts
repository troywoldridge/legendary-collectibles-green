/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { getUserPlan, canSeeTrends } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Canonical alert payload going forward:
// - market_item_id is required
// - game is stored for convenience
// - rule_type: above | below
// - threshold: USD numeric
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const plan = await getUserPlan(userId);
  if (!canSeeTrends(plan)) {
    return NextResponse.json({ error: "Pro required" }, { status: 402 });
  }

  const res = await db.execute(sql`
    SELECT
      a.id,
      a.game,
      a.rule_type,
      a.threshold,
      a.active,
      a.created_at,
      a.updated_at,
      a.last_triggered_at,

      a.market_item_id,
      mi.display_name,
      mi.set_name,
      mi.number,
      mi.image_url,
      mi.canonical_id,
      mi.canonical_source
    FROM price_alerts a
    JOIN market_items mi ON mi.id = a.market_item_id
    WHERE a.user_id = ${userId}
    ORDER BY a.created_at DESC
  `);

  // Keep response key as `alerts` so your existing UI doesn’t break
  return NextResponse.json({ alerts: res.rows ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const plan = await getUserPlan(userId);
  if (!canSeeTrends(plan)) {
    return NextResponse.json({ error: "Pro required" }, { status: 402 });
  }

  const body = await req.json().catch(() => ({}));

  const marketItemId = String(body?.market_item_id ?? "").trim();
  const game = String(body?.game ?? "").trim().toLowerCase();
  const ruleType = String(body?.rule_type ?? "").trim().toLowerCase();
  const thresholdNum = Number(body?.threshold);

  if (!marketItemId || !["pokemon", "mtg", "yugioh"].includes(game)) {
    return NextResponse.json({ error: "Invalid game or market_item_id" }, { status: 400 });
  }
  if (!["above", "below"].includes(ruleType) || !Number.isFinite(thresholdNum)) {
    return NextResponse.json({ error: "Invalid rule_type or threshold" }, { status: 400 });
  }

  // Prevent duplicates using unique index (user_id, market_item_id, rule_type)
  const inserted = await db.execute(sql`
    INSERT INTO price_alerts (user_id, game, market_item_id, rule_type, threshold, active)
    VALUES (${userId}, ${game}, ${marketItemId}::uuid, ${ruleType}, ${thresholdNum}, true)
    ON CONFLICT (user_id, market_item_id, rule_type)
    DO UPDATE SET
      threshold = EXCLUDED.threshold,
      active = true,
      updated_at = now()
    RETURNING id
  `);

  const id = (inserted.rows as any[])?.[0]?.id ?? null;
  return NextResponse.json({ id }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await db.execute(sql`
    DELETE FROM price_alerts
    WHERE id = ${id}::uuid
      AND user_id = ${userId}
  `);

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
