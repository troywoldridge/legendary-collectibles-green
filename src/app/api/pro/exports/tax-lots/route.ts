import "server-only";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { getLivePriceForCard, normalizeGame, type LivePrice } from "@/lib/livePrices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

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

type ItemRow = {
  id: string;
  game: string;
  card_id: string;
  quantity: number;
  cost_cents: number | null;
  created_at: string | null;
};

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const gameParam = url.searchParams.get("game");
  const gameNormalized = gameParam ? normalizeGame(gameParam) : null;

  const res = await db.execute<ItemRow>(sql`
    SELECT id, game, card_id, quantity, cost_cents, created_at
    FROM user_collection_items
    WHERE user_id = ${userId}
    ${gameNormalized ? sql`AND game = ${gameNormalized}` : sql``}
    ORDER BY game, card_id
  `);

  const items = (res.rows ?? []) as ItemRow[];

  const enriched = await Promise.all(
    items.map(async (it) => {
      const g = normalizeGame(it.game);
      const p = await getLivePriceForCard(g as any, it.card_id);

      const marketEach = getUsd(p) ?? 0;
      const source = (p as any)?.source ?? (p as any)?.provider ?? "";

      const qty = Number(it.quantity || 0);

      const costTotal = it.cost_cents != null ? Number(it.cost_cents) / 100 : 0;
      const costEach = qty > 0 ? costTotal / qty : 0;

      const marketTotal = marketEach * qty;
      const gainTotal = marketTotal - costTotal;

      const roiPct = costTotal > 0 ? (gainTotal / costTotal) * 100 : null;

      return {
        ...it,
        qty,
        cost_each: costEach,
        cost_total: costTotal,
        market_each: marketEach,
        market_total: marketTotal,
        gain_total: gainTotal,
        roi_pct: roiPct,
        source,
      };
    }),
  );

  const header = [
    "item_id",
    "game",
    "card_id",
    "quantity",
    "acquired_at",
    "cost_each_usd",
    "cost_total_usd",
    "market_each_usd",
    "market_total_usd",
    "unrealized_gain_usd",
    "roi_pct",
    "market_source",
  ];

  const lines = [header.join(",")];

  for (const x of enriched) {
    lines.push(
      [
        csvEscape(x.id),
        csvEscape(x.game),
        csvEscape(x.card_id),
        csvEscape(x.qty),
        csvEscape(x.created_at ?? ""),
        csvEscape(x.cost_each),
        csvEscape(x.cost_total),
        csvEscape(x.market_each),
        csvEscape(x.market_total),
        csvEscape(x.gain_total),
        csvEscape(x.roi_pct == null ? "" : x.roi_pct),
        csvEscape(x.source),
      ].join(","),
    );
  }

  const csv = lines.join("\n");
  const filename = gameNormalized
    ? `tax_lots_${gameNormalized}_${new Date().toISOString().slice(0, 10)}.csv`
    : `tax_lots_all_${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
