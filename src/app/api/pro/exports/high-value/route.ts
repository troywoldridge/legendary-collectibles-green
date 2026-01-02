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
};

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const threshold = Math.max(1, Number(url.searchParams.get("threshold") || "250"));
  const gameParam = url.searchParams.get("game");
  const gameNormalized = gameParam ? normalizeGame(gameParam) : null;

  const res = await db.execute<ItemRow>(sql`
    SELECT id, game, card_id, quantity, cost_cents
    FROM user_collection_items
    WHERE user_id = ${userId}
    ${gameNormalized ? sql`AND game = ${gameNormalized}` : sql``}
  `);

  const items = (res.rows ?? []) as ItemRow[];

  const priced = await Promise.all(
    items.map(async (it) => {
      const g = normalizeGame(it.game);
      const p = await getLivePriceForCard(g as any, it.card_id);
      const each = getUsd(p) ?? 0;
      const qty = Number(it.quantity || 0);
      const total = each * qty;
      const costTotal = it.cost_cents != null ? Number(it.cost_cents) / 100 : 0;

      return {
        ...it,
        market_each: each,
        market_total: total,
        cost_total: costTotal,
        source: (p as any)?.source ?? (p as any)?.provider ?? "",
      };
    }),
  );

  const filtered = priced
    .filter((x) => x.market_total >= threshold)
    .sort((a, b) => b.market_total - a.market_total);

  const header = [
    "game",
    "card_id",
    "quantity",
    "market_each_usd",
    "market_total_usd",
    "cost_total_usd",
    "unrealized_gain_usd",
    "market_source",
  ];

  const lines = [header.join(",")];

  for (const x of filtered) {
    const gain = Number(x.market_total) - Number(x.cost_total);
    lines.push(
      [
        csvEscape(x.game),
        csvEscape(x.card_id),
        csvEscape(x.quantity),
        csvEscape(x.market_each),
        csvEscape(x.market_total),
        csvEscape(x.cost_total),
        csvEscape(gain),
        csvEscape(x.source),
      ].join(","),
    );
  }

  const csv = lines.join("\n");
  const filename = gameNormalized
    ? `high_value_${gameNormalized}_${threshold}_${new Date().toISOString().slice(0, 10)}.csv`
    : `high_value_all_${threshold}_${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
