// src/app/api/dev/collection/revalue/route.ts
import "server-only";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { getLivePriceForCard, normalizeGame, type GameId } from "@/lib/livePrices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Simple GET so you can verify the route exists in a browser.
export async function GET() {
  return NextResponse.json({
    ok: true,
    message:
      "Dev collection revalue endpoint (NO TOKEN). POST to run a full revalue.",
  });
}

// YYYY-MM-DD for DATE columns
function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

type ItemRow = {
  id: string; // user_collection_items.id (uuid)
  user_id: string;
  game: string; // raw stored game
  card_id: string;
  quantity: number | null;
  cost_cents: number | null; // per-copy cost basis
};

type GameAgg = {
  quantity: number;
  itemIds: Set<string>;
  totalCostCents: number;
  totalValueCents: number;
};

type UserAgg = {
  totalQuantity: number;
  distinctItems: Set<string>;
  totalCostCents: number;
  totalValueCents: number;
  byGame: Map<string, GameAgg>; // key: normalized game id
};

export async function POST() {
  // 1) Load all collection items
  const res = await db.execute<ItemRow>(sql`
    SELECT
      id,
      user_id,
      game,
      card_id,
      quantity,
      cost_cents
    FROM user_collection_items
  `);

  const items = res.rows ?? [];
  if (!items.length) {
    return NextResponse.json({
      ok: true,
      updatedItems: 0,
      users: 0,
      message: "No collection items to revalue.",
    });
  }

  const asOfDate = todayISODate();

  const totalsByUser = new Map<string, UserAgg>();

  let updatedCount = 0;
  let skippedNoPrice = 0;
  let skippedUnsupportedGame = 0;

  await db.transaction(async (tx) => {
    // 2) Update each item + write per-item valuation snapshot
    for (const item of items) {
      const gameNorm = normalizeGame(item.game);
      if (!gameNorm) {
        skippedUnsupportedGame++;
        continue;
      }

      const qty = item.quantity ?? 1;
      if (!item.card_id) {
        skippedNoPrice++;
        continue;
      }

      const livePrice = await getLivePriceForCard(gameNorm as GameId, item.card_id);
      if (!livePrice) {
        skippedNoPrice++;
        continue;
      }

      const unitPriceCents = Math.round(livePrice.amount * 100); // per copy
      const totalValueCents = unitPriceCents * qty;

      // Update main collection row with *total* value
      await tx.execute(sql`
        UPDATE user_collection_items
        SET
          last_value_cents = ${totalValueCents},
          updated_at = now()
        WHERE id = ${item.id}
      `);

      // Per-item valuation snapshot
      const source = (livePrice as any)?.source ?? null;
      const confidence = (livePrice as any)?.confidence ?? null;

      const metaJson = JSON.stringify({
        unit_price_cents: unitPriceCents,
        quantity: qty,
        card_id: item.card_id,
      });

      await tx.execute(sql`
        INSERT INTO user_collection_item_valuations (
          user_id,
          item_id,
          as_of_date,
          game,
          value_cents,
          currency,
          source,
          confidence,
          meta
        )
        VALUES (
          ${item.user_id},
          ${item.id},
          ${asOfDate},
          ${gameNorm},
          ${totalValueCents},
          'USD',
          ${source},
          ${confidence},
          ${metaJson}::jsonb
        )
        ON CONFLICT (user_id, item_id, as_of_date, COALESCE(source, ''::text))
        DO UPDATE SET
          value_cents = EXCLUDED.value_cents,
          currency    = EXCLUDED.currency,
          game        = EXCLUDED.game,
          confidence  = COALESCE(EXCLUDED.confidence, user_collection_item_valuations.confidence),
          meta        = COALESCE(EXCLUDED.meta, user_collection_item_valuations.meta),
          updated_at  = NOW()
      `);

      updatedCount++;

      // 3) Aggregate per-user + per-game for daily portfolio stats
      let userAgg = totalsByUser.get(item.user_id);
      if (!userAgg) {
        userAgg = {
          totalQuantity: 0,
          distinctItems: new Set<string>(),
          totalCostCents: 0,
          totalValueCents: 0,
          byGame: new Map<string, GameAgg>(),
        };
        totalsByUser.set(item.user_id, userAgg);
      }

      userAgg.totalQuantity += qty;
      userAgg.distinctItems.add(item.id);

      const totalCostForRow = (item.cost_cents ?? 0) * qty;
      userAgg.totalCostCents += totalCostForRow;
      userAgg.totalValueCents += totalValueCents;

      let gameAgg = userAgg.byGame.get(gameNorm);
      if (!gameAgg) {
        gameAgg = {
          quantity: 0,
          itemIds: new Set<string>(),
          totalCostCents: 0,
          totalValueCents: 0,
        };
        userAgg.byGame.set(gameNorm, gameAgg);
      }

      gameAgg.quantity += qty;
      gameAgg.itemIds.add(item.id);
      gameAgg.totalCostCents += totalCostForRow;
      gameAgg.totalValueCents += totalValueCents;
    }

    // 4) Write daily portfolio valuation per user (upsert so reruns are safe)
    for (const [userId, agg] of totalsByUser.entries()) {
      const totalQuantity = agg.totalQuantity;
      const distinctItems = agg.distinctItems.size;
      const totalCostCents = agg.totalCostCents || 0;
      const totalValueCents = agg.totalValueCents || 0;

      const unrealizedPnlCents =
        distinctItems > 0 ? totalValueCents - totalCostCents : null;

      const breakdownByGame: Record<
        string,
        {
          totalQuantity: number;
          distinctItems: number;
          totalCostCents: number;
          totalValueCents: number;
        }
      > = {};

      for (const [game, gAgg] of agg.byGame.entries()) {
        breakdownByGame[game] = {
          totalQuantity: gAgg.quantity,
          distinctItems: gAgg.itemIds.size,
          totalCostCents: gAgg.totalCostCents,
          totalValueCents: gAgg.totalValueCents,
        };
      }

      const breakdownJson = JSON.stringify({ byGame: breakdownByGame });

      await tx.execute(sql`
        INSERT INTO user_collection_daily_valuations (
          user_id,
          as_of_date,
          total_quantity,
          distinct_items,
          total_cost_cents,
          total_value_cents,
          realized_pnl_cents,
          unrealized_pnl_cents,
          breakdown
        )
        VALUES (
          ${userId},
          ${asOfDate},
          ${totalQuantity},
          ${distinctItems},
          ${totalCostCents},
          ${totalValueCents},
          NULL,
          ${unrealizedPnlCents},
          ${breakdownJson}::jsonb
        )
        ON CONFLICT (user_id, as_of_date)
        DO UPDATE SET
          total_quantity       = EXCLUDED.total_quantity,
          distinct_items       = EXCLUDED.distinct_items,
          total_cost_cents     = EXCLUDED.total_cost_cents,
          total_value_cents    = EXCLUDED.total_value_cents,
          unrealized_pnl_cents = EXCLUDED.unrealized_pnl_cents,
          breakdown            = EXCLUDED.breakdown,
          updated_at           = NOW()
      `);
    }
  });

  return NextResponse.json({
    ok: true,
    updatedItems: updatedCount,
    skippedNoPrice,
    skippedUnsupportedGame,
    users: totalsByUser.size,
    asOfDate,
  });
}
