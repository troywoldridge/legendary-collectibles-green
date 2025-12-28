import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getLivePriceForCard, normalizeGame, type GameId } from "@/lib/livePrices";

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

export async function revalueUserCollection(userId: string, asOfDate?: string) {
  const date = asOfDate ?? todayISODate();

  // Load only THIS user’s items
  const res = await db.execute<ItemRow>(sql`
    SELECT
      id,
      user_id,
      game,
      card_id,
      quantity,
      cost_cents
    FROM user_collection_items
    WHERE user_id = ${userId}
  `);

  const items = res.rows ?? [];
  if (!items.length) {
    return {
      ok: true,
      asOfDate: date,
      updatedItems: 0,
      skippedNoPrice: 0,
      skippedUnsupportedGame: 0,
      message: "No collection items for user.",
    };
  }

  const totals: UserAgg = {
    totalQuantity: 0,
    distinctItems: new Set<string>(),
    totalCostCents: 0,
    totalValueCents: 0,
    byGame: new Map<string, GameAgg>(),
  };

  let updatedCount = 0;
  let skippedNoPrice = 0;
  let skippedUnsupportedGame = 0;

  await db.transaction(async (tx) => {
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

      const unitPriceCents = Math.round(livePrice.amount * 100);
      const totalValueCents = unitPriceCents * qty;

      await tx.execute(sql`
        UPDATE user_collection_items
        SET
          last_value_cents = ${totalValueCents},
          updated_at = now()
        WHERE id = ${item.id}
      `);

      const source = (livePrice as any)?.source ?? "effective";
      const confidence = (livePrice as any)?.confidence ?? null;

      const metaJson = JSON.stringify({
        unit_price_cents: unitPriceCents,
        quantity: qty,
        card_id: item.card_id,
      });

      // Matches your UNIQUE index:
      // (user_id, item_id, as_of_date, COALESCE(source,''))
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
          ${date},
          ${gameNorm},
          ${totalValueCents},
          'USD',
          ${source},
          ${confidence},
          ${metaJson}::jsonb
        )
        ON CONFLICT (user_id, item_id, as_of_date, (COALESCE(source, '')))
        DO UPDATE SET
          value_cents = EXCLUDED.value_cents,
          currency    = EXCLUDED.currency,
          game        = EXCLUDED.game,
          confidence  = COALESCE(EXCLUDED.confidence, user_collection_item_valuations.confidence),
          meta        = COALESCE(EXCLUDED.meta, user_collection_item_valuations.meta),
          updated_at  = NOW()
      `);

      updatedCount++;

      // aggregate totals
      totals.totalQuantity += qty;
      totals.distinctItems.add(item.id);

      const totalCostForRow = (item.cost_cents ?? 0) * qty;
      totals.totalCostCents += totalCostForRow;
      totals.totalValueCents += totalValueCents;

      let gameAgg = totals.byGame.get(gameNorm);
      if (!gameAgg) {
        gameAgg = { quantity: 0, itemIds: new Set<string>(), totalCostCents: 0, totalValueCents: 0 };
        totals.byGame.set(gameNorm, gameAgg);
      }

      gameAgg.quantity += qty;
      gameAgg.itemIds.add(item.id);
      gameAgg.totalCostCents += totalCostForRow;
      gameAgg.totalValueCents += totalValueCents;
    }

    // Daily portfolio row for this user
    const distinctItems = totals.distinctItems.size;
    const unrealizedPnlCents =
      distinctItems > 0 ? totals.totalValueCents - totals.totalCostCents : null;

    const breakdownByGame: Record<string, any> = {};
    for (const [game, gAgg] of totals.byGame.entries()) {
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
        ${date},
        ${totals.totalQuantity},
        ${distinctItems},
        ${totals.totalCostCents},
        ${totals.totalValueCents},
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
  });

  return {
    ok: true,
    asOfDate: date,
    updatedItems: updatedCount,
    skippedNoPrice,
    skippedUnsupportedGame,
    userId,
  };
}
