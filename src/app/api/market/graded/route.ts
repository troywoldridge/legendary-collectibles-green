import "server-only";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { getUserPlan } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function norm(s: unknown) {
  return String(s ?? "").trim().toLowerCase();
}

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const plan = await getUserPlan(userId);
  const isPro = plan.id === "pro";
  const isCollector = plan.id === "collector";

  if (!isPro && !isCollector) {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 });
  }

  const url = new URL(req.url);
  const game = norm(url.searchParams.get("game"));
  const cardId = String(url.searchParams.get("cardId") ?? "").trim();
  const currency = String(url.searchParams.get("currency") ?? "USD").trim().toUpperCase();

  if (!game || !cardId) {
    return NextResponse.json({ error: "Missing game/cardId" }, { status: 400 });
  }

  const res = await db.execute<{
    game: string;
    card_id: string;
    currency: string;
    raw_cents: number | null;
    psa_1_cents: number | null;
    psa_2_cents: number | null;
    psa_3_cents: number | null;
    psa_4_cents: number | null;
    psa_5_cents: number | null;
    psa_6_cents: number | null;
    psa_7_cents: number | null;
    psa_8_cents: number | null;
    psa_9_cents: number | null;
    psa_10_cents: number | null;
    source: string;
    source_updated_at: string | null;
    captured_at: string;
    updated_at: string;
  }>(sql`
    SELECT
      game, card_id, currency,
      raw_cents,
      psa_1_cents, psa_2_cents, psa_3_cents, psa_4_cents, psa_5_cents,
      psa_6_cents, psa_7_cents, psa_8_cents, psa_9_cents, psa_10_cents,
      source, source_updated_at, captured_at, updated_at
    FROM public.card_market_prices_graded_latest
    WHERE game = ${game}
      AND card_id = ${cardId}
      AND currency = ${currency}
    LIMIT 1
  `);

  const row = res.rows?.[0] ?? null;

  return NextResponse.json({
    ok: true,
    game,
    cardId,
    currency,
    data: row,
  });
}
