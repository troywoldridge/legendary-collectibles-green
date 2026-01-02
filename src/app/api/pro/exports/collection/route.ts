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

// ✅ tolerant extractor: works even if LivePrice doesn't expose `price`
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

  // Sometimes it's nested (e.g. { prices: { usd: ... } })
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
  created_at?: string | null;
};

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const gameParam = url.searchParams.get("game"); // optional
  const gameNormalized = gameParam ? normalizeGame(gameParam) : null;

  const res = await db.execute<ItemRow>(sql`
    SELECT
      id,
      game,
      card_id,
      quantity,
      cost_cents,
      created_at
    FROM user_collection_items
    WHERE user_id = ${userId}
    ${gameNormalized ? sql`AND game = ${gameNormalized}` : sql``}
    ORDER BY game, card_id
  `);

  const items = (res.rows ?? []) as ItemRow[];

  const priced = await Promise.all(
    items.map(async (it) => {
      const g = normalizeGame(it.game);
      const p = await getLivePriceForCard(g as any, it.card_id);
      const market = getUsd(p);
      const marketSource = (p as any)?.source ?? (p as any)?.provider ?? null;
      return { ...it, market, marketSource };
    }),
  );

  const header = [
    "item_id",
    "game",
    "card_id",
    "quantity",
    "cost_basis_total_usd",
    "market_price_each_usd",
    "market_value_total_usd",
    "market_source",
    "created_at",
  ];

  const lines = [header.join(",")];

  for (const it of priced) {
    const qty = Number(it.quantity || 0);
    const costTotalUsd = it.cost_cents != null ? Number(it.cost_cents) / 100 : "";
    const marketEachUsd = it.market != null ? Number(it.market) : "";
    const marketTotalUsd = it.market != null ? Number(it.market) * qty : "";

    lines.push(
      [
        csvEscape(it.id),
        csvEscape(it.game),
        csvEscape(it.card_id),
        csvEscape(qty),
        csvEscape(costTotalUsd),
        csvEscape(marketEachUsd),
        csvEscape(marketTotalUsd),
        csvEscape(it.marketSource ?? ""),
        csvEscape(it.created_at ?? ""),
      ].join(","),
    );
  }

  const csv = lines.join("\n");
  const filename = gameNormalized
    ? `collection_${gameNormalized}_${new Date().toISOString().slice(0, 10)}.csv`
    : `collection_all_${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
