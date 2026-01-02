"use client";

import { useEffect, useState } from "react";

type Payload = {
  totals: {
    costBasis: number;
    marketValue: number;
    gain: number;
    roiPct: number | null;
  };
  concentration: {
    top10SharePct: number | null;
  };
};

function usd(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default function AdvancedLtvPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await fetch("/api/pro/ltv", { cache: "no-store" });
      const j = (await res.json()) as Payload;
      if (!cancelled) setData(j);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
      <h2 className="text-lg font-semibold text-white">Advanced LTV Tools</h2>
      <div className="text-sm text-white/70">Cost basis, ROI, and concentration risk.</div>

      {loading ? (
        <div className="mt-3 text-white/70">Loading…</div>
      ) : !data ? (
        <div className="mt-3 text-white/70">No data.</div>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs text-white/60">Cost basis</div>
            <div className="text-xl font-bold text-white">{usd(data.totals.costBasis)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs text-white/60">Market value</div>
            <div className="text-xl font-bold text-white">{usd(data.totals.marketValue)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs text-white/60">Unrealized gain</div>
            <div className="text-xl font-bold text-white">{usd(data.totals.gain)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs text-white/60">ROI</div>
            <div className="text-xl font-bold text-white">
              {data.totals.roiPct == null ? "—" : `${data.totals.roiPct.toFixed(1)}%`}
            </div>
          </div>

          <div className="sm:col-span-2 rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs text-white/60">Concentration (top 10 items)</div>
            <div className="text-sm text-white/85">
              {data.concentration.top10SharePct == null
                ? "—"
                : `${data.concentration.top10SharePct.toFixed(1)}% of your value is in your top 10 items.`}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
