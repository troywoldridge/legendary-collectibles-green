"use client";

import { useEffect, useState } from "react";

type Row = { game: string; card_id: string; metric: string; value: number; note?: string | null };

function usd(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default function TcgplayerTopListsPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await fetch("/api/pro/toplists", { cache: "no-store" });
      const j = (await res.json()) as { rows: Row[] };
      if (!cancelled) setRows(j.rows || []);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
      <h2 className="text-lg font-semibold text-white">TCGplayer Top Lists</h2>
      <div className="text-sm text-white/70">Powered by your collection + live pricing.</div>

      {loading ? (
        <div className="mt-3 text-white/70">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="mt-3 text-white/70">No list yet.</div>
      ) : (
        <div className="mt-3 space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2">
              <div className="text-sm text-white/85">
                <b className="text-white">{r.metric}</b> • {r.game} • {r.card_id}
                {r.note ? <span className="text-white/60"> • {r.note}</span> : null}
              </div>
              <div className="text-sm font-semibold text-white">{usd(r.value)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
