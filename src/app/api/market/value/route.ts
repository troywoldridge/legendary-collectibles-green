import "server-only";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { convert } from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function norm(s: unknown) {
  return String(s ?? "").trim();
}

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

function pickPriceFromBucket(bucket: any): number | null {
  const market = toNum(bucket?.marketPrice);
  if (market != null && market > 0) return market;

  const mid = toNum(bucket?.midPrice);
  if (mid != null && mid > 0) return mid;

  const low = toNum(bucket?.lowPrice);
  if (low != null && low > 0) return low;

  const high = toNum(bucket?.highPrice);
  if (high != null && high > 0) return high;

  return null;
}

function bestSnapshotPrice(raw: any): { amount: number; currency: "USD" | "EUR"; updatedAt: string | null; source: string } | null {
  const pricing = raw?.pricing ?? {};
  const tcg = pricing?.tcgplayer ?? null;
  const cm = pricing?.cardmarket ?? null;

  const tcgUnit = normCur(tcg?.unit ?? "USD");
  const tcgUpdated = typeof tcg?.updated === "string" ? tcg.updated : null;

  const tcgBest =
    pickPriceFromBucket(tcg?.normal) ??
    pickPriceFromBucket(tcg?.["reverse-holofoil"]) ??
    pickPriceFromBucket(tcg?.holofoil) ??
    null;

  if (tcgBest != null && tcgBest > 0) {
    return { amount: tcgBest, currency: tcgUnit, updatedAt: tcgUpdated, source: "tcgplayer" };
  }

  // Cardmarket is EUR
  const cmUpdated = typeof cm?.updated === "string" ? cm.updated : null;
  const cmBest =
    toNum(cm?.trend) ??
    toNum(cm?.avg) ??
    toNum(cm?.low) ??
    toNum(cm?.["trend-holo"]) ??
    toNum(cm?.["avg-holo"]) ??
    toNum(cm?.["low-holo"]) ??
    null;

  if (cmBest != null && cmBest > 0) {
    return { amount: cmBest, currency: "EUR", updatedAt: cmUpdated, source: "cardmarket" };
  }

  return null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  // Existing contract: cardKey + grade. In your old system cardKey looked like "pokemon|tcgdex|bw1-103".
  // We'll accept that, but also accept raw tcgdex card ids directly.
  const cardKey = norm(searchParams.get("cardKey"));
  const grade = norm(searchParams.get("grade"));

  if (!cardKey || !grade) {
    return NextResponse.json({ error: "Missing cardKey or grade" }, { status: 400 });
  }

  // Parse cardKey: "<game>|<source>|<id>" OR "<id>"
  const parts = cardKey.split("|").map((x) => x.trim()).filter(Boolean);
  const cardId = parts.length >= 3 ? parts[2] : cardKey;

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
    return NextResponse.json({
      row: null,
      note: "No tcgdex snapshot found for this card id.",
      cardKey,
      grade,
      cardId,
    });
  }

  const snap = bestSnapshotPrice(row.raw_json);

  if (!snap) {
    return NextResponse.json({
      row: null,
      note: "tcgdex snapshot found, but no usable pricing fields.",
      cardKey,
      grade,
      cardId,
    });
  }

  const usd =
    snap.currency === "USD"
      ? snap.amount
      : (convert(snap.amount, "EUR", "USD") ?? null);

  // Preserve your old response shape as much as possible
  return NextResponse.json({
    row: {
      as_of_date: snap.updatedAt ?? null,
      card_key: cardKey,
      grade,
      market_value_usd: usd,
      range_low_usd: null,
      range_high_usd: null,
      last_sale_usd: null,
      last_sale_at: null,
      sales_count_180d: null,
      confidence: null,
      source: snap.source,
      native_currency: snap.currency,
      native_amount: snap.amount,
    },
  });
}
