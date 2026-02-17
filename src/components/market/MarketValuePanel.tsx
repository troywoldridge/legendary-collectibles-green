import "server-only";

import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { convert, formatMoney } from "@/lib/pricing";

type Props = {
  game: "pokemon" | "yugioh" | "mtg" | "funko";
  canonicalId: string; // pokemon card id, etc.

  // kept for compatibility; not used with tcgdex snapshot
  canonicalSource?: string | null;

  title?: string;
  showDisclaimer?: boolean;

  // gating (kept; but tcgdex snapshot doesn't provide true ranges/confidence)
  canSeeRanges?: boolean;
  canSeeConfidence?: boolean;
};

type TcgdexCardRow = {
  id: string;
  raw_json: any;
};

type Money = {
  amount: number;
  currency: "USD" | "EUR";
};

function safeString(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = safeString(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function normCur(v: unknown): "USD" | "EUR" {
  const s = safeString(v).trim().toUpperCase();
  return s === "EUR" ? "EUR" : "USD";
}

function money(amount: number | null, currency: "USD" | "EUR"): Money | null {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return null;
  return { amount, currency };
}

function moneyUsd(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n) || n <= 0) return "—";
  return formatMoney(n, "USD");
}

function fmtUpdated(v: unknown) {
  const s = safeString(v).trim();
  if (!s) return null;
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return s;
  return new Date(t).toISOString();
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

async function getTcgdexCard(id: string): Promise<TcgdexCardRow | null> {
  const res = await db.execute<TcgdexCardRow>(sql`
    SELECT id, raw_json
    FROM public.tcgdex_cards
    WHERE id = ${id}
    LIMIT 1
  `);
  return res.rows?.[0] ?? null;
}

/**
 * MarketValuePanel (tcgdex snapshot version)
 *
 * tcgdex does NOT provide:
 * - true daily history (for trend vs yesterday)
 * - p25/p75 ranges
 * - confidence grades
 *
 * So:
 * - "Market value" = best available snapshot converted to USD
 * - trend = always "↔" with "No trend data yet"
 * - range/confidence gated but shown as unavailable rather than lying
 */
export default async function MarketValuePanel({
  game,
  canonicalId,
  canonicalSource = null,
  title = "Market Value",
  showDisclaimer = true,
  canSeeRanges = false,
  canSeeConfidence = false,
}: Props) {
  void game;
  void canonicalSource;

  const cid = String(canonicalId ?? "").trim();
  if (!cid) return null;

  const row = await getTcgdexCard(cid);
  const raw = row?.raw_json ?? null;

  if (!raw) {
    return (
      <section className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <div className="mt-2 text-sm text-white/70">No tcgdex snapshot found yet for this item.</div>
      </section>
    );
  }

  const pricing = raw?.pricing ?? {};
  const tcg = pricing?.tcgplayer ?? null;
  const cm = pricing?.cardmarket ?? null;

  // Prefer TCGplayer normal market, then reverse/holo, then Cardmarket trend/avg
  const tcgUnit = normCur(tcg?.unit ?? "USD");
  const tcgUpdated = fmtUpdated(tcg?.updated);

  const bestTcg =
    money(pickPriceFromBucket(tcg?.normal), tcgUnit) ??
    money(pickPriceFromBucket(tcg?.["reverse-holofoil"]), tcgUnit) ??
    money(pickPriceFromBucket(tcg?.holofoil), tcgUnit);

  // Cardmarket is EUR
  const cmUpdated = fmtUpdated(cm?.updated);
  const cmUnit: "EUR" = "EUR";

  const bestCm =
    money(toNum(cm?.trend), cmUnit) ??
    money(toNum(cm?.avg), cmUnit) ??
    money(toNum(cm?.low), cmUnit) ??
    money(toNum(cm?.["trend-holo"]), cmUnit) ??
    money(toNum(cm?.["avg-holo"]), cmUnit) ??
    money(toNum(cm?.["low-holo"]), cmUnit);

  const best = bestTcg ?? bestCm;

  // Convert best -> USD for display
  const marketUsd =
    best == null
      ? null
      : best.currency === "USD"
        ? best.amount
        : (convert(best.amount, "EUR", "USD") ?? null);

  const updated = tcgUpdated ?? cmUpdated ?? null;

  const trend = { arrow: "↔", label: "No trend data yet (tcgdex provides snapshot pricing, not daily series)." };

  return (
    <section className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
      <div className="flex flex-wrap items-start justify-between gap-6">
        {/* LEFT */}
        <div className="min-w-[260px]">
          <h2 className="text-lg font-semibold text-white">{title}</h2>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/80">
            <span className="text-2xl font-bold text-white">{moneyUsd(marketUsd)}</span>

            <span
              className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/80"
              title={trend.label}
            >
              {trend.arrow}
            </span>

            {canSeeConfidence ? (
              <span className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/80">
                Confidence: <span className="font-semibold text-white">—</span>
              </span>
            ) : (
              <Link
                href="/pricing"
                className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
                prefetch={false}
                title="Pro required to view confidence (not available from tcgdex snapshot)"
              >
                Confidence: 🔒 Pro
              </Link>
            )}
          </div>

          <div className="mt-2 text-xs text-white/60">
            {updated ? <>As of {updated}</> : <>As of latest snapshot</>}
            {best ? (
              <>
                {" "}
                • Source:{" "}
                <span className="text-white/80">{bestTcg ? "TCGplayer" : "Cardmarket"}</span>
              </>
            ) : null}
          </div>

          {!best ? (
            <div className="mt-2 text-xs text-white/70">
              No usable price fields found in snapshot yet.
            </div>
          ) : null}
        </div>

        {/* RIGHT */}
        <div className="min-w-60">
          <div className="text-xs uppercase tracking-wide text-white/60">Range</div>

          {canSeeRanges ? (
            <div className="mt-1 text-sm text-white">
              <span className="font-semibold">—</span>
              <span className="text-white/50"> — </span>
              <span className="font-semibold">—</span>
            </div>
          ) : (
            <Link
              href="/pricing"
              className="mt-1 inline-block rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
              prefetch={false}
              title="Collector required to view ranges (not available from tcgdex snapshot)"
            >
              🔒 Collector+ to view range
            </Link>
          )}

          <div className="mt-2 text-[11px] text-white/50">
            Ranges require historical aggregation (p25–p75). tcgdex snapshot doesn’t include that yet.
          </div>
        </div>
      </div>

      {showDisclaimer ? (
        <div className="mt-4 border-t border-white/10 pt-3 text-xs text-white/60">
          Market value based on snapshot pricing (tcgdex). Not a guaranteed sale price.
        </div>
      ) : null}
    </section>
  );
}
