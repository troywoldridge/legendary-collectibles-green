import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PriceRow = {
  card_id: string;
  variant_type: string | null;
  low_price: number | null;
  mid_price: number | null;
  high_price: number | null;
  market_price: number | null;
  currency: string | null;
  updated_at: string | null;
};

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function normCur(v: unknown): "USD" | "EUR" {
  const s = String(v ?? "").trim().toUpperCase();
  return s === "EUR" ? "EUR" : "USD";
}

function bucketToRow(cardId: string, variantType: string, bucket: any, currency: "USD" | "EUR", updatedAt: string | null): PriceRow {
  return {
    card_id: cardId,
    variant_type: variantType,
    low_price: toNum(bucket?.lowPrice),
    mid_price: toNum(bucket?.midPrice),
    high_price: toNum(bucket?.highPrice),
    market_price: toNum(bucket?.marketPrice),
    currency,
    updated_at: updatedAt,
  };
}

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const cardId = decodeURIComponent(id ?? "").trim();

  const row =
    (
      await db.execute<{ id: string; raw_json: any }>(sql`
        SELECT id, raw_json
        FROM public.tcgdex_cards
        WHERE id = ${cardId}
        LIMIT 1
      `)
    ).rows?.[0] ?? null;

  if (!row?.raw_json) {
    return NextResponse.json({ cardId, prices: [], note: "tcgdex snapshot not found" }, { status: 404 });
  }

  const tcg = row.raw_json?.pricing?.tcgplayer ?? null;
  if (!tcg) {
    return NextResponse.json({ cardId, prices: [], note: "tcgdex pricing.tcgplayer missing" }, { status: 200 });
  }

  const currency = normCur(tcg?.unit ?? "USD");
  const updatedAt = typeof tcg?.updated === "string" ? tcg.updated : null;

  const prices: PriceRow[] = [];

  if (tcg.normal) prices.push(bucketToRow(cardId, "normal", tcg.normal, currency, updatedAt));
  if (tcg["reverse-holofoil"]) prices.push(bucketToRow(cardId, "reverse-holofoil", tcg["reverse-holofoil"], currency, updatedAt));
  if (tcg.holofoil) prices.push(bucketToRow(cardId, "holofoil", tcg.holofoil, currency, updatedAt));

  // keep stable ordering
  prices.sort((a, b) => String(a.variant_type ?? "").localeCompare(String(b.variant_type ?? "")));

  return NextResponse.json({ cardId, prices });
}
