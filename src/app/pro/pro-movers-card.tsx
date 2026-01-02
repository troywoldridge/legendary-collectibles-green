"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  game: string;
  card_id: string;
  qty: number;
  from: number | null;
  to: number | null;
  changePct: number | null;
  deltaEach: number | null;
  deltaTotal: number | null;
};

function fmtMoney(n: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function fmtPct(n: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export default function ProMoversCard({ days, limit }: { days: number; limit: number }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const res = await fetch(`/api/pro/exports/movers?days=${days}&limit=${limit}`, {
          cache: "no-store",
        });

        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(`Movers failed (${res.status}): ${txt.slice(0, 200)}`);
        }

        const json = await res.json();
        if (!alive) return;
        setRows((json?.rows ?? []) as Row[]);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Unknown error");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [days, limit]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => Math.abs((b.deltaTotal ?? 0)) - Math.abs((a.deltaTotal ?? 0)));
  }, [rows]);

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm opacity-80">Top movers ({days} days)</div>
          <div className="text-lg font-semibold">Collection Value Impact</div>
        </div>
        <a
          href={`/api/pro/exports/movers?days=${days}&limit=200&format=csv`}
          className="rounded-md border px-3 py-2 text-sm hover:opacity-90"
        >
          CSV
        </a>
      </div>

      {loading ? (
        <p className="mt-4 opacity-80">Loading movers…</p>
      ) : err ? (
        <p className="mt-4 text-sm opacity-80">
          Error: {err}
        </p>
      ) : !sorted.length ? (
        <p className="mt-4 opacity-80">No movers found (missing price history for your items).</p>
      ) : (
        <div className="mt-4 overflow-auto">
          <table className="w-full text-sm">
            <thead className="opacity-80">
              <tr className="text-left">
                <th className="py-2 pr-3">Game</th>
                <th className="py-2 pr-3">Card</th>
                <th className="py-2 pr-3">Qty</th>
                <th className="py-2 pr-3">From</th>
                <th className="py-2 pr-3">To</th>
                <th className="py-2 pr-3">Change</th>
                <th className="py-2 pr-3">Δ Total</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, idx) => (
                <tr key={`${r.game}:${r.card_id}:${idx}`} className="border-t">
                  <td className="py-2 pr-3">{r.game}</td>
                  <td className="py-2 pr-3">{r.card_id}</td>
                  <td className="py-2 pr-3">{r.qty}</td>
                  <td className="py-2 pr-3">{fmtMoney(r.from)}</td>
                  <td className="py-2 pr-3">{fmtMoney(r.to)}</td>
                  <td className="py-2 pr-3">{fmtPct(r.changePct)}</td>
                  <td className="py-2 pr-3">{fmtMoney(r.deltaTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
