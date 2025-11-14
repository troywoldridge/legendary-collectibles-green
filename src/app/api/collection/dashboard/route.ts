/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/api/collection/dashboard/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { sql, and, eq, gte } from "drizzle-orm";
import {
  userCollectionDailyValuations,
  userCollectionItemValuations,
} from "@/lib/db/schema/collectionAnalytics";

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

  // 1) Load all collection items for this user
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

  // 2) Compute aggregates
  let totalQuantity = 0;
  const distinctItems = items.length;
  let totalCostCents = 0;
  let totalValueCents = 0;

  const byGame: Record<string, { quantity: number; valueCents: number }> = {};

  for (const row of items) {
    const qty = row.quantity ?? 0;
    const costPer = row.cost_cents ?? 0;
    const valuePer = row.last_value_cents ?? row.cost_cents ?? 0;

    totalQuantity += qty;
    if (row.cost_cents != null) {
      totalCostCents += qty * row.cost_cents;
    }
    totalValueCents += qty * valuePer;

    const gameKey = row.game || "other";
    if (!byGame[gameKey]) {
      byGame[gameKey] = { quantity: 0, valueCents: 0 };
    }
    byGame[gameKey].quantity += qty;
    byGame[gameKey].valueCents += qty * valuePer;
  }

  const breakdown = { byGame };

  // 3) Upsert today's portfolio snapshot into user_collection_daily_valuations
  await db
    .insert(userCollectionDailyValuations)
    .values({
      userId,
      asOfDate: todayStr,
      totalQuantity,
      distinctItems,
      totalCostCents,
      totalValueCents,
      realizedPnlCents: null,
      unrealizedPnlCents: null,
      breakdown,
    })
    .onConflictDoUpdate({
      target: [
        userCollectionDailyValuations.userId,
        userCollectionDailyValuations.asOfDate,
      ],
      set: {
        totalQuantity,
        distinctItems,
        totalCostCents,
        totalValueCents,
        breakdown,
        // createdAt left untouched
      },
    });

  // 4) Upsert per-item valuations (for card-level charts)
  for (const row of items) {
    const qty = row.quantity ?? 0;
    const priceCents = row.last_value_cents ?? row.cost_cents ?? null;
    const totalItemValue =
      priceCents != null ? priceCents * qty : null;

    await db
      .insert(userCollectionItemValuations)
      .values({
        userId,
        itemId: row.id,
        asOfDate: todayStr,
        game: row.game,
        quantity: qty,
        priceCents,
        totalValueCents: totalItemValue,
        source: "effective",
      })
      .onConflictDoUpdate({
        target: [
          userCollectionItemValuations.itemId,
          userCollectionItemValuations.asOfDate,
          userCollectionItemValuations.source,
        ],
        set: {
          quantity: qty,
          priceCents,
          totalValueCents: totalItemValue,
        },
      });
  }

  // 5) Fetch history for last 60 days for the portfolio chart
  const lookbackDays = 60;
  const from = new Date(today);
  from.setDate(from.getDate() - lookbackDays);
  const fromStr = toDateStr(from);

  const historyRows = await db
    .select({
      asOfDate: userCollectionDailyValuations.asOfDate,
      totalValueCents: userCollectionDailyValuations.totalValueCents,
      totalCostCents: userCollectionDailyValuations.totalCostCents,
      totalQuantity: userCollectionDailyValuations.totalQuantity,
    })
    .from(userCollectionDailyValuations)
    .where(
      and(
        eq(userCollectionDailyValuations.userId, userId),
        gte(userCollectionDailyValuations.asOfDate, fromStr),
      ),
    )
    .orderBy(userCollectionDailyValuations.asOfDate);

  // 6) Recently added list (for a widget on the collection page)
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
      lastValueCents: r.last_value_cents,
      createdAt: r.created_at,
    }));

  // 7) Return JSON the UI can feed straight into widgets / charts
  return NextResponse.json({
    summary: {
      totalQuantity,
      distinctItems,
      totalCostCents,
      totalValueCents,
      byGame,
    },
    history: historyRows.map((h) => ({
      date: h.asOfDate,
      totalValueCents: h.totalValueCents ?? 0,
      totalCostCents: h.totalCostCents ?? 0,
      totalQuantity: h.totalQuantity,
    })),
    recentlyAdded,
  });
}
