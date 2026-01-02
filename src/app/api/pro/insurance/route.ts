import "server-only";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import {
  getLivePriceForCard,
  normalizeGame,
  type LivePrice,
} from "@/lib/livePrices";
import { getUserPlan, canSeeInsuranceReports } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ItemRow = {
  id: string;
  game: string;
  card_id: string;
  quantity: number;
  cost_cents: number | null;
};

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// tolerant extractor (no `.price` usage)
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
  const nn =
    typeof nested === "string" ? Number(nested) : typeof nested === "number" ? nested : NaN;
  if (Number.isFinite(nn)) return nn;

  return null;
}

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ✅ plan gating (Insurance = insuranceReports)
  const plan = await getUserPlan(userId);
  if (!canSeeInsuranceReports(plan)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const format = (url.searchParams.get("format") || "json").toLowerCase(); // json | csv
  const threshold = Math.max(1, Number(url.searchParams.get("threshold") || "250"));

  const res = await db.execute<ItemRow>(sql`
    SELECT id, game, card_id, quantity, cost_cents
    FROM user_collection_items
    WHERE user_id = ${userId}
  `);

  const items = (res.rows ?? []) as ItemRow[];

  const priced = await Promise.all(
    items.map(async (it) => {
      const g = normalizeGame(it.game);
      const p = await getLivePriceForCard(g as any, it.card_id);

      const marketEach = getUsd(p) ?? 0;
      const marketTotal = marketEach * Number(it.quantity || 0);

      const costEach = it.cost_cents != null ? Number(it.cost_cents) / 100 : 0;
      const costTotal = costEach * Number(it.quantity || 0);

      return {
        ...it,
        marketEach,
        marketTotal,
        costEach,
        costTotal,
        source: (p as any)?.source ?? (p as any)?.provider ?? null,
      };
    }),
  );

  const totalsByGame: Record<
    string,
    { market: number; cost: number; qty: number; items: number }
  > = {};
  let totalMarket = 0;
  let totalCost = 0;

  for (const it of priced) {
    const g = it.game;
    totalsByGame[g] ||= { market: 0, cost: 0, qty: 0, items: 0 };
    totalsByGame[g].market += it.marketTotal;
    totalsByGame[g].cost += it.costTotal;
    totalsByGame[g].qty += Number(it.quantity || 0);
    totalsByGame[g].items += 1;

    totalMarket += it.marketTotal;
    totalCost += it.costTotal;
  }

  const highValue = priced
    .filter((x) => x.marketTotal >= threshold)
    .sort((a, b) => b.marketTotal - a.marketTotal)
    .slice(0, 200);

  const payload = {
    asOf: new Date().toISOString(),
    threshold,
    totals: {
      marketValue: totalMarket,
      costBasis: totalCost,
      unrealizedGain: totalMarket - totalCost,
    },
    byGame: totalsByGame,
    highValueItems: highValue.map((x) => ({
      game: x.game,
      card_id: x.card_id,
      quantity: x.quantity,
      market_each: x.marketEach,
      market_total: x.marketTotal,
      source: x.source,
    })),
  };

  if (format === "csv") {
    const header = ["game", "card_id", "quantity", "market_each_usd", "market_total_usd", "source"];
    const lines = [header.join(",")];

    for (const x of highValue) {
      lines.push(
        [
          csvEscape(x.game),
          csvEscape(x.card_id),
          csvEscape(x.quantity),
          csvEscape(x.marketEach),
          csvEscape(x.marketTotal),
          csvEscape(x.source ?? ""),
        ].join(","),
      );
    }

    return new NextResponse(lines.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="insurance_report_${new Date()
          .toISOString()
          .slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
