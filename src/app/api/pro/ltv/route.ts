import "server-only";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { getLivePriceForCard, normalizeGame, type LivePrice } from "@/lib/livePrices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ItemRow = {
  game: string;
  card_id: string;
  quantity: number;
  cost_cents: number | null;
};

function getUsd(p: LivePrice | null | undefined): number | null {
  if (!p) return null;
  const anyP = p as any;

  const candidates = [
    anyP.usd,
    anyP.priceUsd,
    anyP.marketUsd,
    anyP.marketPrice,
    anyP.price,
    anyP.value,
    anyP.amount,
    anyP.mid,
  ];

  for (const c of candidates) {
    const n = typeof c === "string" ? Number(c) : typeof c === "number" ? c : NaN;
    if (Number.isFinite(n)) return n;
  }

  const nested = anyP.prices?.usd ?? anyP.prices?.price ?? anyP.market?.usd;
  const nn = typeof nested === "string" ? Number(nested) : typeof nested === "number" ? nested : NaN;
  if (Number.isFinite(nn)) return nn;

  return null;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await db.execute<ItemRow>(sql`
    SELECT game, card_id, quantity, cost_cents
    FROM user_collection_items
    WHERE user_id = ${userId}
  `);

  const items = (res.rows ?? []) as ItemRow[];
  if (items.length === 0) {
    return NextResponse.json(
      { totals: { costBasis: 0, marketValue: 0, gain: 0, roiPct: null }, concentration: { top10SharePct: null } },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const priced = await Promise.all(
    items.map(async (it) => {
      const g = normalizeGame(it.game);
      const p = await getLivePriceForCard(g as any, it.card_id);

      const each = getUsd(p) ?? 0;
      const qty = Number(it.quantity || 0);
      const marketTotal = each * qty;
      const costTotal = it.cost_cents != null ? Number(it.cost_cents) / 100 : 0;

      return { marketTotal, costTotal };
    }),
  );

  const costBasis = priced.reduce((a, b) => a + b.costTotal, 0);
  const marketValue = priced.reduce((a, b) => a + b.marketTotal, 0);
  const gain = marketValue - costBasis;
  const roiPct = costBasis > 0 ? (gain / costBasis) * 100 : null;

  const sortedByValue = [...priced].sort((a, b) => b.marketTotal - a.marketTotal);
  const top10Value = sortedByValue.slice(0, 10).reduce((a, b) => a + b.marketTotal, 0);
  const top10SharePct = marketValue > 0 ? (top10Value / marketValue) * 100 : null;

  return NextResponse.json(
    {
      totals: { costBasis, marketValue, gain, roiPct },
      concentration: { top10SharePct },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
