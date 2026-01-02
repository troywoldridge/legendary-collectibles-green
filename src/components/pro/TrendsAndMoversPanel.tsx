"use client";

import { useEffect, useState } from "react";

type Mover = { game: string; card_id: string; qty: number; from: number; to: number; changePct: number };

function usd(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default function TrendsAndMoversPanel() {
  const [rows, setRows] = useState<Mover[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await fetch("/api/pro/movers?days=7", { cache: "no-store" });
      const j = (await res.json()) as { rows: Mover[] };
      if (!cancelled) setRows(j.rows || []);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
      <h2 className="text-lg font-semibold text-white">Trends & Movers</h2>
      <div className="text-sm text-white/70">Biggest movers in your collection (7d).</div>

      {loading ? (
        <div className="mt-3 text-white/70">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="mt-3 text-white/70">No movers yet.</div>
      ) : (
        <div className="mt-3 space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
              <div className="text-sm text-white/90">
                <b>{r.game}</b> • {r.card_id} • qty {r.qty}
              </div>
              <div className="text-sm text-white/70">
                {usd(r.from)} → {usd(r.to)} • <span className="text-white">{r.changePct.toFixed(1)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
