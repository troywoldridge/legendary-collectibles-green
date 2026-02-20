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

function toBool(v: unknown): boolean {
  const s = norm(v).toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y";
}

function toNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v));
  return Number.isFinite(n) ? n : null;
}

function dollarsToCents(v: number): number {
  return Math.round(v * 100);
}

function isPlainObject(v: any): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/**
 * Normalize tcgdex raw_json into a real JS object, regardless of pg/drizzle return type.
 */
function normalizeRawJson(input: any): any | null {
  if (input == null) return null;

  // Already a plain object
  if (isPlainObject(input)) return input;

  // JSON string
  if (typeof input === "string") {
    const s = input.trim();
    if (!s) return null;
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }

  // Buffer -> string -> JSON
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(input)) {
    try {
      const s = input.toString("utf8").trim();
      if (!s) return null;
      return JSON.parse(s);
    } catch {
      return null;
    }
  }

  // Last resort: try to stringify then parse
  try {
    const s = JSON.stringify(input);
    if (!s) return null;
    return JSON.parse(s);
  } catch {
    return null;
  }
}

const TCGPREFERRED_BUCKET_ORDER = [
  "normal",
  "reverse-holofoil",
  "holofoil",
  "unlimited",
  "1st-edition",
  "unlimited-holofoil",
  "1st-edition-holofoil",
] as const;

function pickBucketPrice(bucket: any): number | null {
  const mp = toNum(bucket?.marketPrice);
  if (mp != null) return mp;

  const mid = toNum(bucket?.midPrice);
  if (mid != null) return mid;

  const low = toNum(bucket?.lowPrice);
  const high = toNum(bucket?.highPrice);
  if (low != null && high != null) return (low + high) / 2;

  return null;
}

function pickTcgplayerUsd(raw: any): { usd: number | null; bucketKey: string | null } {
  const tp = raw?.pricing?.tcgplayer;
  if (!isPlainObject(tp)) return { usd: null, bucketKey: null };

  for (const k of TCGPREFERRED_BUCKET_ORDER) {
    if (!Object.prototype.hasOwnProperty.call(tp, k)) continue;
    const v = (tp as any)[k];
    if (!isPlainObject(v)) continue;
    const price = pickBucketPrice(v);
    if (price != null) return { usd: price, bucketKey: k };
  }

  for (const k of Object.keys(tp)) {
    if ((TCGPREFERRED_BUCKET_ORDER as readonly string[]).includes(k)) continue;
    const v = (tp as any)[k];
    if (!isPlainObject(v)) continue;
    const price = pickBucketPrice(v);
    if (price != null) return { usd: price, bucketKey: k };
  }

  return { usd: null, bucketKey: null };
}

function pickCardmarketEur(raw: any): number | null {
  const cm = raw?.pricing?.cardmarket;
  if (!isPlainObject(cm)) return null;

  const primaryKeys = ["trend", "avg30", "avg7", "avg"] as const;
  for (const k of primaryKeys) {
    const v = toNum((cm as any)[k]);
    if (v != null) return v;
  }

  const holoKeys = ["trend-holo", "avg30-holo", "avg7-holo", "avg-holo"] as const;
  for (const k of holoKeys) {
    const v = toNum((cm as any)[k]);
    if (v != null) return v;
  }

  const extra = ["avg1", "avg1-holo", "low", "low-holo"] as const;
  for (const k of extra) {
    const v = toNum((cm as any)[k]);
    if (v != null) return v;
  }

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

  if (usd != null && eur != null) return { usd, eur, derivedCurrency: null as "USD" | "EUR" | null };

  if (usd != null && eur == null) {
    const r = fxUsdToEur();
    if (r != null) {
      eur = usd * r;
      return { usd, eur, derivedCurrency: "EUR" as const };
    }
  }

  if (eur != null && usd == null) {
    const r = fxEurToUsd();
    if (r != null) {
      usd = eur * r;
      return { usd, eur, derivedCurrency: "USD" as const };
    }
  }

  return { usd, eur, derivedCurrency: null as "USD" | "EUR" | null };
}

async function upsertSnapshot(args: {
  cardId: string;
  currency: "USD" | "EUR";
  cents: number;
  raw: any;
  dryRun: boolean;
}) {
  const { cardId, currency, cents, raw, dryRun } = args;

  const rawJsonStr = JSON.stringify(raw ?? null);
  if (dryRun) return;

  await db.execute(sql`
    INSERT INTO public.tcgdex_price_snapshots_daily (
      card_id, as_of_date, currency, market_price_cents, raw_json, created_at, updated_at
    )
    VALUES (
      ${cardId}::text,
      CURRENT_DATE,
      ${currency}::text,
      ${cents}::int,
      ${rawJsonStr}::jsonb,
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

async function ensureTableExists() {
  const r = await db.execute<{ ok: number }>(sql`
    SELECT CASE WHEN to_regclass('public.tcgdex_price_snapshots_daily') IS NULL THEN 0 ELSE 1 END AS ok
  `);
  return (r.rows?.[0]?.ok ?? 0) === 1;
}

export async function GET(req: Request) {
  const headerSecret = norm((req as any).headers?.get?.("x-cron-secret"));
  const envSecret = norm(process.env.CRON_SECRET || process.env.JOB_SECRET);

  if (!envSecret || headerSecret !== envSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = toInt(url.searchParams.get("limit"), 500, 1, 5000);
  const startAfterId = norm(url.searchParams.get("startAfterId"));
  const dryRun = toBool(url.searchParams.get("dryRun"));
  const debug = toBool(url.searchParams.get("debug"));

  const startedAt = Date.now();

  const tableOk = await ensureTableExists();
  if (!tableOk) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing table: public.tcgdex_price_snapshots_daily",
        hint: "Run your migration / create-table step for tcgdex snapshots.",
      },
      { status: 500 }
    );
  }

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

  let wroteRows = 0;
  let wroteCards = 0;

  let derivedRows = 0;

  const skippedReasons: Record<string, number> = {
    missing_card_or_raw: 0,
    raw_not_parseable: 0,
    no_usd_no_eur: 0,
  };

  let errorRows = 0;
  const errorCardSet = new Set<string>();

  const debugSamples: Array<any> = [];
  const skippedSamples: Array<any> = [];
  const bucketCounts: Record<string, number> = {};

  let lastId: string | null = null;

  for (const r of rows) {
    const cardId = norm(r.id);
    lastId = cardId || lastId;

    if (!cardId || r.raw_json == null) {
      skippedReasons.missing_card_or_raw++;
      processed++;
      continue;
    }

    const raw = normalizeRawJson(r.raw_json);
    if (!raw) {
      skippedReasons.raw_not_parseable++;
      if (debug && skippedSamples.length < 25) {
        skippedSamples.push({
          cardId,
          rawType: typeof r.raw_json,
          isBuffer: typeof Buffer !== "undefined" ? Buffer.isBuffer(r.raw_json) : false,
        });
      }
      processed++;
      continue;
    }

    let wroteUsd = false;
    let wroteEur = false;

    const usdPick = pickTcgplayerUsd(raw);
    const eur = pickCardmarketEur(raw);

    if (usdPick.bucketKey) {
      bucketCounts[usdPick.bucketKey] = (bucketCounts[usdPick.bucketKey] ?? 0) + 1;
    }

    const both = computeOtherCurrency({ usd: usdPick.usd, eur });
    if (both.derivedCurrency) derivedRows++;

    if (both.usd == null && both.eur == null) {
      skippedReasons.no_usd_no_eur++;
      if (debug && skippedSamples.length < 25) {
        skippedSamples.push({
          cardId,
          tcgplayerKeys: isPlainObject(raw?.pricing?.tcgplayer) ? Object.keys(raw.pricing.tcgplayer) : null,
          cardmarketKeys: isPlainObject(raw?.pricing?.cardmarket) ? Object.keys(raw.pricing.cardmarket) : null,
          tcgplayerValue: raw?.pricing?.tcgplayer ?? null,
          cardmarketValue: raw?.pricing?.cardmarket ?? null,
        });
      }
      processed++;
      continue;
    }

    let wroteThisCard = 0;

    if (both.usd != null) {
      try {
        await upsertSnapshot({
          cardId,
          currency: "USD",
          cents: dollarsToCents(both.usd),
          raw,
          dryRun,
        });
        wroteRows++;
        wroteThisCard++;
        wroteUsd = true;
      } catch (err: any) {
        errorRows++;
        errorCardSet.add(cardId);
        console.log(
          "[tcgdex snapshots] failed",
          JSON.stringify({
            cardId,
            currency: "USD",
            message: err?.message ? String(err.message) : "Unknown error",
            ...(err?.cause ? { cause: String(err.cause) } : {}),
          })
        );
      }
    }

    if (both.eur != null) {
      try {
        await upsertSnapshot({
          cardId,
          currency: "EUR",
          cents: dollarsToCents(both.eur),
          raw,
          dryRun,
        });
        wroteRows++;
        wroteThisCard++;
        wroteEur = true;
      } catch (err: any) {
        errorRows++;
        errorCardSet.add(cardId);
        console.log(
          "[tcgdex snapshots] failed",
          JSON.stringify({
            cardId,
            currency: "EUR",
            message: err?.message ? String(err.message) : "Unknown error",
            ...(err?.cause ? { cause: String(err.cause) } : {}),
          })
        );
      }
    }

    if (wroteThisCard > 0) wroteCards++;

    if (debug && debugSamples.length < 25) {
      debugSamples.push({
        cardId,
        tcgplayerBucket: usdPick.bucketKey,
        usd: both.usd,
        eur: both.eur,
        derivedCurrency: both.derivedCurrency,
        wroteUsd,
        wroteEur,
      });
    }

    processed++;
  }

  const ms = Date.now() - startedAt;
  const nextStartAfterId = lastId && lastId !== startAfterId ? lastId : null;

  const skipped = Object.values(skippedReasons).reduce((a, b) => a + b, 0);

  const body: any = {
    ok: true,
    dryRun,
    limit,
    startAfterId: startAfterId || null,
    nextStartAfterId,
    processed,
    wrote_rows: wroteRows,
    wrote_cards: wroteCards,
    skipped,
    skipped_reasons: skippedReasons,
    derived_rows: derivedRows,
    errors: errorCardSet.size,
    error_rows: errorRows,
    ms,
    note: "Writes up to 2 rows/card/day (USD + EUR). Normalizes raw_json to plain JS objects before reading. USD bucket chosen dynamically across all tcgplayer keys. Cardmarket supports trend/avg30/avg7/avg plus -holo variants. If only one currency exists, derives the other using FX_USD_TO_EUR / FX_EUR_TO_USD.",
  };

  if (debug) {
    body.debug_samples = debugSamples;
    body.skipped_samples = skippedSamples;
    body.usd_bucket_counts = bucketCounts;
  }

  return NextResponse.json(body);
}
