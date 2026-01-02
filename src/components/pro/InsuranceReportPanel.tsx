"use client";

import { useEffect, useMemo, useState } from "react";

type InsurancePayload = {
  asOf: string;
  totals: { marketValue: number; costBasis: number; unrealizedGain: number };
  byGame: Record<string, { market: number; cost: number; qty: number; items: number }>;
  highValueItems: Array<{
    game: string;
    card_id: string;
    quantity: number;
    market_each: number;
    market_total: number;
    source: string | null;
  }>;
};

function usd(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default function InsuranceReportPanel() {
  const [data, setData] = useState<InsurancePayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await fetch("/api/pro/insurance", { cache: "no-store" });
      const j = (await res.json()) as InsurancePayload;
      if (!cancelled) setData(j);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.byGame)
      .map(([game, v]) => ({ game, ...v }))
      .sort((a, b) => b.market - a.market);
  }, [data]);

  return (
    <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Insurance Report</h2>
        <div className="flex gap-2">
          <button
            className="rounded bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15"
            onClick={() => window.open("/api/pro/insurance?format=csv", "_self")}
          >
            Download CSV
          </button>
          <button
            className="rounded bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15"
            onClick={() => window.print()}
          >
            Print
          </button>
        </div>
      </div>

      {loading ? (
        <div className="mt-3 text-white/70">Loading…</div>
      ) : !data ? (
        <div className="mt-3 text-white/70">No data.</div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-xs text-white/60">Replacement value</div>
              <div className="text-xl font-bold text-white">{usd(data.totals.marketValue)}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-xs text-white/60">Cost basis</div>
              <div className="text-xl font-bold text-white">{usd(data.totals.costBasis)}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-xs text-white/60">Unrealized gain</div>
              <div className="text-xl font-bold text-white">{usd(data.totals.unrealizedGain)}</div>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-sm font-semibold text-white">Breakdown</div>
            <div className="mt-2 space-y-1 text-sm text-white/85">
              {rows.map((r) => (
                <div key={r.game} className="flex items-center justify-between">
                  <span className="text-white/80">{r.game}</span>
                  <span className="font-semibold text-white">{usd(r.market)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="text-xs text-white/50">
            As of {new Date(data.asOf).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}
