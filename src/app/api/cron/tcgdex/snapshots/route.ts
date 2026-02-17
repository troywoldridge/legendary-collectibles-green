import "server-only";

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function norm(v: unknown) {
  return String(v ?? "").trim();
}

function toInt(v: unknown, fallback: number, min = 1, max = 5000) {
  const n = Number(String(v ?? ""));
  if (!Number.isFinite(n)) return fallback;
  const m = Math.floor(n);
  if (m < min) return fallback;
  return Math.min(m, max);
}

function toNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v));
  return Number.isFinite(n) ? n : null;
}

function dollarsToCents(v: number): number {
  // avoid floating drift
  return Math.round(v * 100);
}

function pickTcgplayerUsd(raw: any): number | null {
  // Prefer marketPrice if present; fall back to midPrice; then low/high average.
  const n = raw?.pricing?.tcgplayer?.normal ?? null;
  const r = raw?.pricing?.tcgplayer?.["reverse-holofoil"] ?? null;
  const h = raw?.pricing?.tcgplayer?.holofoil ?? null;

  const candidates = [n, r, h].filter(Boolean);

  for (const c of candidates) {
    const mp = toNum(c?.marketPrice);
    if (mp != null) return mp;
  }
  for (const c of candidates) {
    const mid = toNum(c?.midPrice);
    if (mid != null) return mid;
  }
  for (const c of candidates) {
    const low = toNum(c?.lowPrice);
    const high = toNum(c?.highPrice);
    if (low != null && high != null) return (low + high) / 2;
  }
  return null;
}

function pickCardmarketEur(raw: any): number | null {
  const cm = raw?.pricing?.cardmarket ?? null;
  // Prefer trend, then avg30, then avg7, then avg
  const trend = toNum(cm?.trend);
  if (trend != null) return trend;

  const avg30 = toNum(cm?.avg30);
  if (avg30 != null) return avg30;

  const avg7 = toNum(cm?.avg7);
  if (avg7 != null) return avg7;

  const avg = toNum(cm?.avg);
  if (avg != null) return avg;

  return null;
}

function fxUsdToEur(): number | null {
  const v = toNum(process.env.FX_USD_TO_EUR);
  return v != null && v > 0 ? v : null;
}

function fxEurToUsd(): number | null {
  const v = toNum(process.env.FX_EUR_TO_USD);
  return v != null && v > 0 ? v : null;
}

function computeOtherCurrency(opts: { usd: number | null; eur: number | null }) {
  let { usd, eur } = opts;

  // If both exist, keep both (best case)
  if (usd != null && eur != null) return { usd, eur, derived: false };

  // If only USD exists, derive EUR
  if (usd != null && eur == null) {
    const r = fxUsdToEur();
    if (r != null) {
      eur = usd * r;
      return { usd, eur, derived: true };
    }
  }

  // If only EUR exists, derive USD
  if (eur != null && usd == null) {
    const r = fxEurToUsd();
    if (r != null) {
      usd = eur * r;
      return { usd, eur, derived: true };
    }
  }

  return { usd, eur, derived: false };
}

async function upsertSnapshot(args: {
  cardId: string;
  currency: "USD" | "EUR";
  cents: number;
  raw: any;
}) {
  const { cardId, currency, cents, raw } = args;

  await db.execute(sql`
    INSERT INTO public.tcgdex_price_snapshots_daily (
      card_id, as_of_date, currency, market_price_cents, raw_json, created_at, updated_at
    )
    VALUES (
      ${cardId}::text,
      CURRENT_DATE,
      ${currency}::text,
      ${cents}::int,
      ${raw}::jsonb,
      now(),
      now()
    )
    ON CONFLICT (card_id, as_of_date, currency)
    DO UPDATE SET
      market_price_cents = EXCLUDED.market_price_cents,
      raw_json = EXCLUDED.raw_json,
      updated_at = now()
  `);
}

export async function GET(req: Request) {
  // Auth
  const headerSecret = norm((req as any).headers?.get?.("x-cron-secret"));
  const envSecret = norm(process.env.CRON_SECRET || process.env.JOB_SECRET);

  if (!envSecret || headerSecret !== envSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = toInt(url.searchParams.get("limit"), 500, 1, 5000);
  const startAfterId = norm(url.searchParams.get("startAfterId"));

  const startedAt = Date.now();

  // Pull a page of tcgdex_cards
  const rows =
    (
      await db.execute<{ id: string; raw_json: any }>(sql`
        SELECT id::text AS id, raw_json
        FROM public.tcgdex_cards
        WHERE (${startAfterId}::text = '' OR id::text > ${startAfterId}::text)
        ORDER BY id::text ASC
        LIMIT ${limit}::int
      `)
    ).rows ?? [];

  let processed = 0;
  let wrote = 0;
  let skipped = 0;
  let derivedCount = 0;
  let errors = 0;

  for (const r of rows) {
    const cardId = norm(r.id);
    const raw = r.raw_json;

    if (!cardId || !raw) {
      skipped++;
      continue;
    }

    try {
      const usd = pickTcgplayerUsd(raw);     // USD signal
      const eur = pickCardmarketEur(raw);    // EUR signal

      const both = computeOtherCurrency({ usd, eur });
      if (both.derived) derivedCount++;

      // Need at least one currency to write anything
      if (both.usd == null && both.eur == null) {
        skipped++;
        processed++;
        continue;
      }

      // Write USD row if available
      if (both.usd != null) {
        const cents = dollarsToCents(both.usd);
        await upsertSnapshot({
          cardId,
          currency: "USD",
          cents,
          raw: {
            provider: "tcgdex",
            currency: "USD",
            market_price: both.usd,
            source: "tcgplayer_or_derived",
            tcgplayer: raw?.pricing?.tcgplayer ?? null,
            cardmarket: raw?.pricing?.cardmarket ?? null,
            derived: both.derived,
            captured_at: new Date().toISOString(),
          },
        });
        wrote++;
      }

      // Write EUR row if available
      if (both.eur != null) {
        const cents = dollarsToCents(both.eur);
        await upsertSnapshot({
          cardId,
          currency: "EUR",
          cents,
          raw: {
            provider: "tcgdex",
            currency: "EUR",
            market_price: both.eur,
            source: "cardmarket_or_derived",
            tcgplayer: raw?.pricing?.tcgplayer ?? null,
            cardmarket: raw?.pricing?.cardmarket ?? null,
            derived: both.derived,
            captured_at: new Date().toISOString(),
          },
        });
        wrote++;
      }

      processed++;
    } catch (e: any) {
      errors++;
      processed++;
      // keep going
      console.error("[tcgdex snapshots] failed for", r.id, e?.message || e);
    }
  }

  const nextStartAfterId = rows.length ? rows[rows.length - 1]!.id : null;

  return NextResponse.json({
    ok: true,
    limit,
    startAfterId: startAfterId || null,
    nextStartAfterId,
    processed,
    wrote_rows: wrote,
    skipped,
    derived_rows: derivedCount,
    errors,
    ms: Date.now() - startedAt,
    note:
      "Writes up to 2 rows/card/day (USD + EUR). If only one currency exists, derives the other using FX_USD_TO_EUR / FX_EUR_TO_USD.",
  });
}
