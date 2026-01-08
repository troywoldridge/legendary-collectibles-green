// src/components/market/MarketValueCard.tsx
import Link from "next/link";

type Plan = "free" | "collector" | "pro";

type ValueRow = {
  market_value_usd: number | null;
  range_low_usd: number | null;
  range_high_usd: number | null;
  last_sale_usd: number | null;
  last_sale_at: string | null;
  sales_count_180d: number | null;
  confidence: string | null;
};

function moneyUsd(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString();
}

function trendArrow(today: number | null, yesterday: number | null) {
  if (today == null || yesterday == null) return { arrow: "↔", label: "No trend data yet" };

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
    return { label: "A", title: "A = High confidence (strong coverage and stable signal over time)." };
  }
  if (v === "B") {
    return { label: "B", title: "B = Medium confidence (some coverage, still stabilizing)." };
  }
  return { label: "C", title: "C = Low confidence (limited data; treat as a rough estimate)." };
}

export default function MarketValueCard(props: {
  title?: string;
  plan: Plan;
  gradeLabel: string;
  value: ValueRow | null | undefined;
  yesterdayValue?: ValueRow | null | undefined;
  psaAprUrl?: string | null;
}) {
  const { title, plan, gradeLabel, value, yesterdayValue, psaAprUrl } = props;

  const canCollector = plan === "collector" || plan === "pro";
  const canPro = plan === "pro";

  const todayMv = value?.market_value_usd ?? null;
  const yMv = yesterdayValue?.market_value_usd ?? null;

  const tr = trendArrow(todayMv, yMv);
  const conf = confidenceHelp(value?.confidence ?? null);

  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-3">
      {title ? <div className="text-xs text-white/70">{title}</div> : null}

      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] text-white/60">Market value</div>

          <div className="mt-0.5 flex items-center gap-2">
            <div className="text-lg font-semibold text-white">{moneyUsd(todayMv)}</div>

            <span
              className="rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-xs text-white/80"
              title={tr.label}
            >
              {tr.arrow}
            </span>
          </div>

          <div className="mt-1 text-[11px] text-white/60">
            Market value based on aggregated market data — not a guaranteed sale price.
          </div>
        </div>

        <div className="text-right">
          <div className="text-[11px] text-white/60">Confidence</div>

          {canPro ? (
            <div
              className="mt-0.5 inline-flex rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-xs text-white/80"
              title={conf.title}
            >
              {conf.label}
            </div>
          ) : (
            <Link
              href="/pricing"
              className="mt-0.5 inline-flex rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-xs text-white/80 hover:bg-white/10"
              prefetch={false}
              title="Pro required to view confidence"
            >
              🔒 Pro
            </Link>
          )}
        </div>
      </div>

      <div className="mt-2 grid gap-1.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-white/70">Grade</span>
          <span className="font-medium text-white">{gradeLabel}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-white/70">Sales (180d)</span>
          <span className="font-medium text-white">{value?.sales_count_180d ?? "—"}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-white/70">Range (p25–p75)</span>
          {canCollector ? (
            <span className="font-medium text-white">
              {moneyUsd(value?.range_low_usd ?? null)} – {moneyUsd(value?.range_high_usd ?? null)}
            </span>
          ) : (
            <span className="text-white/60">
              <Link className="underline" href="/pricing" prefetch={false}>
                Upgrade
              </Link>{" "}
              to view
            </span>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-white/70">Last signal</span>
          {canCollector ? (
            <span className="font-medium text-white">
              {moneyUsd(value?.last_sale_usd ?? null)}
              {value?.last_sale_at ? ` • ${fmtDate(value.last_sale_at)}` : ""}
            </span>
          ) : (
            <span className="text-white/60">
              <Link className="underline" href="/pricing" prefetch={false}>
                Upgrade
              </Link>{" "}
              to view
            </span>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-white/60">
        <span>References</span>
        {psaAprUrl ? (
          <a className="underline" href={psaAprUrl} target="_blank" rel="noreferrer">
            PSA APR
          </a>
        ) : (
          <span className="text-white/40">—</span>
        )}
      </div>
    </section>
  );
}
