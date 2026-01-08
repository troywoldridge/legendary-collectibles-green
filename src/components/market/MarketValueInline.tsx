// src/components/market/MarketValueInline.tsx
import Link from "next/link";

type Plan = "free" | "collector" | "pro";

type ValueRow = {
  market_value_usd: number | string | null;
  range_low_usd: number | string | null;
  range_high_usd: number | string | null;
  confidence: string | null;
};

function toNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v));
  return Number.isFinite(n) ? n : null;
}

function moneyUsd(v: number | string | null | undefined) {
  const n = toNum(v);
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

function trendArrow(todayV: number | string | null, yesterdayV: number | string | null) {
  const today = toNum(todayV);
  const yesterday = toNum(yesterdayV);

  if (today == null || yesterday == null) return { arrow: "↔", title: "No trend data yet" };

  const denom = Math.max(1, Math.abs(yesterday));
  const pct = ((today - yesterday) / denom) * 100;

  if (pct > 0.5) return { arrow: "↑", title: `Up vs yesterday (${pct.toFixed(1)}%)` };
  if (pct < -0.5) return { arrow: "↓", title: `Down vs yesterday (${Math.abs(pct).toFixed(1)}%)` };
  return { arrow: "↔", title: `Flat vs yesterday (${pct.toFixed(1)}%)` };
}

function confidenceHelp(c: string | null) {
  const v = String(c ?? "").trim().toUpperCase();
  if (!v) return { label: "—", title: "Confidence unavailable" };

  if (v === "A") return { label: "A", title: "A = High confidence (strong coverage and stable signal over time)." };
  if (v === "B") return { label: "B", title: "B = Medium confidence (some coverage, still stabilizing)." };
  if (v === "C") return { label: "C", title: "C = Low confidence (limited data; treat as a rough estimate)." };

  // If you’ve got legacy grades like D, treat them as very low confidence.
  return { label: v, title: `${v} = Very low confidence (limited data).` };
}

export default function MarketValueInline(props: {
  plan: Plan;
  today: ValueRow | null | undefined;
  yesterday?: ValueRow | null | undefined;
  showDisclaimer?: boolean;
}) {
  const { plan, today, yesterday, showDisclaimer = true } = props;

  const canCollector = plan === "collector" || plan === "pro";
  const canPro = plan === "pro";

  const tv = today?.market_value_usd ?? null;
  const yv = yesterday?.market_value_usd ?? null;

  const tr = trendArrow(tv, yv);
  const conf = confidenceHelp(today?.confidence ?? null);

  return (
    <div className="mt-2 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-white/60">Market:</span>
        <span className="font-semibold text-white">{moneyUsd(tv)}</span>

        <span
          className="rounded border border-white/10 bg-black/20 px-1.5 py-0.5 text-[11px] text-white/80"
          title={tr.title}
        >
          {tr.arrow}
        </span>

        {canCollector ? (
          <span className="text-white/70">
            • Range:{" "}
            <span className="text-white">
              {moneyUsd(today?.range_low_usd ?? null)}–{moneyUsd(today?.range_high_usd ?? null)}
            </span>
          </span>
        ) : (
          <span className="text-white/60">
            •{" "}
            <Link href="/pricing" className="underline" prefetch={false} title="Collector required to view ranges">
              Collector+
            </Link>{" "}
            for range
          </span>
        )}

        {canPro ? (
          <span className="text-white/70" title={conf.title}>
            • Conf: <span className="font-semibold text-white">{conf.label}</span>
          </span>
        ) : (
          <span className="text-white/60">
            •{" "}
            <Link href="/pricing" className="underline" prefetch={false} title="Pro required to view confidence">
              Pro
            </Link>{" "}
            for confidence
          </span>
        )}
      </div>

      {showDisclaimer ? (
        <div className="mt-1 text-[11px] text-white/50">
          Market value based on aggregated market data — not a guaranteed sale price.
        </div>
      ) : null}
    </div>
  );
}
