// src/components/market/MarketValuePanel.tsx
import "server-only";

import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

type Props = {
  game: "pokemon" | "yugioh" | "mtg" | "funko";
  canonicalId: string; // pokemon card id, ygo card_id, mtg scryfall id
  canonicalSource?: string | null; // mtg: "scryfall", others can be null
  title?: string;
  showDisclaimer?: boolean;

  // gating
  canSeeRanges?: boolean;
  canSeeConfidence?: boolean;
};

type MarketItemKeyRow = {
  game: string;
  canonical_source: string | null;
  canonical_id: string | null;
};

type DailyRow = {
  as_of_date: string;
  market_value_usd: number | null;
  range_low_usd: number | null;
  range_high_usd: number | null;
  confidence: string | null;
  sales_count_180d: number | null;
  last_sale_usd: number | null;
  last_sale_at: string | null;
  grade: string | null;
};

function moneyUsd(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function trendArrow(today: number | null, yesterday: number | null) {
  if (today == null || yesterday == null) return { arrow: "↔", label: "No trend data yet" };

  // Avoid noise: 0.5% threshold
  const denom = Math.max(1, Math.abs(yesterday));
  const pct = ((today - yesterday) / denom) * 100;

  if (pct > 0.5) return { arrow: "↑", label: `Up vs yesterday (${pct.toFixed(1)}%)` };
  if (pct < -0.5) return { arrow: "↓", label: `Down vs yesterday (${Math.abs(pct).toFixed(1)}%)` };
  return { arrow: "↔", label: `Flat vs yesterday (${pct.toFixed(1)}%)` };
}

function confidenceHelp(c: string | null) {
  const v = String(c ?? "").trim().toUpperCase();
  if (!v) return { label: "—", title: "Confidence unavailable" };

  if (v === "A") {
    return {
      label: "A",
      title: "A = High confidence (strong coverage and stable signal over time).",
    };
  }
  if (v === "B") {
    return {
      label: "B",
      title: "B = Medium confidence (some coverage, still stabilizing).",
    };
  }
  return {
    label: "C",
    title: "C = Low confidence (limited data; treat as a rough estimate).",
  };
}

export default async function MarketValuePanel({
  game,
  canonicalId,
  canonicalSource = null,
  title = "Market Value",
  showDisclaimer = true,
  canSeeRanges = false,
  canSeeConfidence = false,
}: Props) {
  const cid = String(canonicalId ?? "").trim();
  if (!cid) return null;

  const keyRow =
    (
      await db.execute<MarketItemKeyRow>(sql`
        SELECT
          mi.game,
          mi.canonical_source,
          mi.canonical_id
        FROM public.market_items mi
        WHERE mi.game = ${game}
          AND mi.canonical_id::text = ${cid}::text
          AND (
            ${canonicalSource}::text IS NULL
            OR mi.canonical_source::text = ${canonicalSource}::text
          )
        LIMIT 1
      `)
    ).rows?.[0] ?? null;

  const source = (keyRow?.canonical_source ?? canonicalSource ?? "card").trim() || "card";
  const cardKey = `${game}|${source}|${cid}`;

  const daily =
    (
      await db.execute<DailyRow>(sql`
        SELECT
          as_of_date::text,
          market_value_usd,
          range_low_usd,
          range_high_usd,
          confidence,
          sales_count_180d,
          last_sale_usd,
          last_sale_at::text,
          grade
        FROM public.market_values_daily
        WHERE card_key = ${cardKey}
          AND as_of_date IN (CURRENT_DATE, CURRENT_DATE - INTERVAL '1 day')
        ORDER BY as_of_date DESC
      `)
    ).rows ?? [];

  const today = daily[0] ?? null;
const yesterday = daily[1] ?? null;

  const todayValue = today?.market_value_usd ?? null;
  const yValue = yesterday?.market_value_usd ?? null;

  const tr = trendArrow(todayValue, yValue);
  const conf = confidenceHelp(today?.confidence ?? null);

  const showRanges = canSeeRanges;
  const showConf = canSeeConfidence;

  return (
    <section className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
      <div className="flex flex-wrap items-start justify-between gap-6">
        {/* LEFT */}
        <div className="min-w-[260px]">
          <h2 className="text-lg font-semibold text-white">{title}</h2>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/80">
            <span className="text-2xl font-bold text-white">{moneyUsd(todayValue)}</span>

            <span
              className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/80"
              title={tr.label}
            >
              {tr.arrow}
            </span>

            {showConf ? (
              <span
                className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/80"
                title={conf.title}
              >
                Confidence: <span className="font-semibold text-white">{conf.label}</span>
              </span>
            ) : (
              <Link
                href="/pricing"
                className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
                prefetch={false}
                title="Pro required to view confidence"
              >
                Confidence: 🔒 Pro
              </Link>
            )}
          </div>

          <div className="mt-2 text-xs text-white/60">
            {today?.as_of_date ? <>As of {today.as_of_date}</> : <>As of today</>}
            {typeof today?.sales_count_180d === "number" ? <> • 180d signal: {today.sales_count_180d}</> : null}
          </div>

          {today?.last_sale_usd != null ? (
            <div className="mt-2 text-xs text-white/70">
              Last signal: <span className="text-white">{moneyUsd(today.last_sale_usd)}</span>
              {today.last_sale_at ? <span className="text-white/50"> • {today.last_sale_at}</span> : null}
            </div>
          ) : null}
        </div>

        {/* RIGHT */}
        <div className="min-w-60">
          <div className="text-xs uppercase tracking-wide text-white/60">Range</div>

          {showRanges ? (
            <div className="mt-1 text-sm text-white">
              <span className="font-semibold">{moneyUsd(today?.range_low_usd ?? null)}</span>
              <span className="text-white/50"> — </span>
              <span className="font-semibold">{moneyUsd(today?.range_high_usd ?? null)}</span>
            </div>
          ) : (
            <Link
              href="/pricing"
              className="mt-1 inline-block rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
              prefetch={false}
              title="Collector required to view ranges"
            >
              🔒 Collector+ to view range
            </Link>
          )}
        </div>
      </div>

      {/* FOOTER DISCLAIMER (full width) */}
      {showDisclaimer ? (
        <div className="mt-4 border-t border-white/10 pt-3 text-xs text-white/60">
          Market value based on aggregated market data — not a guaranteed sale price.
        </div>
      ) : null}
    </section>
  );
}
