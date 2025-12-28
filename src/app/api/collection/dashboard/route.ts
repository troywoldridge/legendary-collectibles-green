/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/api/collection/dashboard/route.ts
import "server-only";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Shape of user_collection_items rows we care about */
type CollectionRow = {
  id: string; // uuid
  user_id: string;
  game: string | null;
  card_id: string | null;
  card_name: string | null;
  set_name: string | null;
  image_url: string | null;
  quantity: number | null;
  cost_cents: number | null;
  last_value_cents: number | null;
  created_at: Date | string;
};

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date();
  const todayStr = toDateStr(today);

  // 1) Load all collection items for this user (for listing widgets)
  const rowsRes = await db.execute<CollectionRow>(sql`
    SELECT
      id,
      user_id,
      game,
      card_id,
      card_name,
      set_name,
      image_url,
      quantity,
      cost_cents,
      last_value_cents,
      created_at
    FROM user_collection_items
    WHERE user_id = ${userId}
  `);

  const items = rowsRes.rows ?? [];

  // 2) Aggregates (market value is last_value_cents; NULL counts as 0)
  const summaryRes = await db.execute<{
    total_quantity: number | string | null;
    distinct_items: number | string | null;
    total_cost_cents: number | string | null;
    total_value_cents: number | string | null;
  }>(sql`
    SELECT
      COALESCE(SUM(COALESCE(quantity, 0)), 0)::int AS total_quantity,
      COUNT(*)::int AS distinct_items,
      COALESCE(SUM(COALESCE(cost_cents, 0) * COALESCE(quantity, 0)), 0)::int AS total_cost_cents,
      COALESCE(SUM(COALESCE(last_value_cents, 0)), 0)::int AS total_value_cents
    FROM user_collection_items
    WHERE user_id = ${userId}
  `);

  const s = summaryRes.rows?.[0] ?? {
    total_quantity: 0,
    distinct_items: 0,
    total_cost_cents: 0,
    total_value_cents: 0,
  };

  const totalQuantity = Number(s.total_quantity ?? 0);
  const distinctItems = Number(s.distinct_items ?? 0);
  const totalCostCents = Number(s.total_cost_cents ?? 0);
  const totalValueCents = Number(s.total_value_cents ?? 0);

  // 2b) byGame (market value only)
  const byGameRes = await db.execute<{
    game: string | null;
    quantity: number | string | null;
    value_cents: number | string | null;
  }>(sql`
    SELECT
      game,
      COALESCE(SUM(COALESCE(quantity, 0)), 0)::int AS quantity,
      COALESCE(SUM(COALESCE(last_value_cents, 0)), 0)::int AS value_cents
    FROM user_collection_items
    WHERE user_id = ${userId}
    GROUP BY game
  `);

  const byGame: Record<string, { quantity: number; valueCents: number }> = {};
  for (const r of byGameRes.rows ?? []) {
    const key = (r.game ?? "other").toLowerCase();
    byGame[key] = {
      quantity: Number(r.quantity ?? 0),
      valueCents: Number(r.value_cents ?? 0),
    };
  }

  // 3) Fetch history for last 60 days from user_collection_daily_valuations (READ ONLY)
  const lookbackDays = 60;
  const from = new Date(today);
  from.setDate(from.getDate() - lookbackDays);
  const fromStr = toDateStr(from);

  const histRes = await db.execute<{
    as_of_date: string;
    total_value_cents: number | string | null;
    total_cost_cents: number | string | null;
    total_quantity: number | string | null;
  }>(sql`
    SELECT
      as_of_date,
      total_value_cents,
      total_cost_cents,
      total_quantity
    FROM user_collection_daily_valuations
    WHERE user_id = ${userId}
      AND as_of_date >= ${fromStr}::date
    ORDER BY as_of_date ASC
  `);

  const historyRows = histRes.rows ?? [];

  // 4) Recently added list (for a widget)
  const recentlyAdded = items
    .slice()
    .sort((a, b) => {
      const da = new Date(a.created_at as any).getTime();
      const dbt = new Date(b.created_at as any).getTime();
      return dbt - da;
    })
    .slice(0, 10)
    .map((r) => ({
      id: r.id,
      game: r.game,
      cardId: r.card_id,
      cardName: r.card_name,
      setName: r.set_name,
      imageUrl: r.image_url,
      quantity: r.quantity ?? 0,
      lastValueCents: r.last_value_cents ?? 0,
      createdAt: r.created_at,
    }));

  // 5) Return JSON
  return NextResponse.json({
    summary: {
      totalQuantity,
      distinctItems,
      totalCostCents,
      totalValueCents,
      byGame,
      asOfDate: todayStr,
    },
    history: historyRows.map((h) => ({
      date: h.as_of_date,
      totalValueCents: Number(h.total_value_cents ?? 0),
      totalCostCents: Number(h.total_cost_cents ?? 0),
      totalQuantity: Number(h.total_quantity ?? 0),
    })),
    recentlyAdded,
  });
}
