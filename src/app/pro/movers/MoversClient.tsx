"use client";

import { useEffect, useMemo, useState } from "react";

type MoversRow = {
  game: string;
  canonical_id: string;

  display_name?: string | null;
  set_name?: string | null;
  number?: string | null;
  image_url?: string | null;

  qty: number;
  from: number | null;
  to: number | null;
  changePct: number | null;
  deltaEach: number | null;
  deltaTotal: number | null;

  fromDate: string | null;
  toDate: string | null;
  toSource: string | null;
  toPriceType: string | null;
};

type MoversResponse = {
  days: number;
  limit: number;
  rows: MoversRow[];
  debug?: any;
};

type SortKey = "impact" | "pct" | "gainers" | "losers";

function fmtUsd(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function fmtPct(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function gameLabel(g: string) {
  const k = String(g || "").toLowerCase();
  if (k === "pokemon") return "Pokémon";
  if (k === "mtg") return "Magic";
  if (k === "yugioh") return "Yu-Gi-Oh!";
  return g || "—";
}

function badgeClass(kind: "pos" | "neg" | "muted") {
  if (kind === "pos") return "border-emerald-400/40 bg-emerald-500/15 text-emerald-100";
  if (kind === "neg") return "border-rose-400/40 bg-rose-500/15 text-rose-100";
  return "border-white/20 bg-white/5 text-white/80";
}

function smallBadge(text: string, kind: "pos" | "neg" | "muted" = "muted") {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${badgeClass(
        kind,
      )}`}
    >
      {text}
    </span>
  );
}

export default function MoversClient() {
  const [days, setDays] = useState(7);
  const [limit, setLimit] = useState(200);
  const [sort, setSort] = useState<SortKey>("impact");
  const [q, setQ] = useState("");
  const [onlyGame, setOnlyGame] = useState("all");

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<MoversResponse | null>(null);

  const csvHref = useMemo(() => {
    const sp = new URLSearchParams({ days: String(days), limit: String(limit), format: "csv" });
    return `/api/pro/exports/movers?${sp.toString()}`;
  }, [days, limit]);

  const jsonHref = useMemo(() => {
    const sp = new URLSearchParams({ days: String(days), limit: String(limit) });
    return `/api/pro/exports/movers?${sp.toString()}`;
  }, [days, limit]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(jsonHref, { cache: "no-store" });
        const text = await res.text();
        if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
        const json = JSON.parse(text) as MoversResponse;
        if (!cancelled) setData(json);
      } catch (e: any) {
        if (!cancelled) {
          setErr(e?.message || "Failed to load movers.");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [jsonHref]);

  const rows = data?.rows ?? [];

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    let r = rows;

    if (onlyGame !== "all") {
      r = r.filter((x) => x.game === onlyGame);
    }

    if (qq) {
      r = r.filter(
        (x) =>
          String(x.canonical_id).toLowerCase().includes(qq) ||
          String(x.display_name ?? "").toLowerCase().includes(qq),
      );
    }

    if (sort === "gainers") r = r.filter((x) => (x.deltaTotal ?? 0) > 0);
    if (sort === "losers") r = r.filter((x) => (x.deltaTotal ?? 0) < 0);

    const sorter =
      sort === "pct"
        ? (a: MoversRow, b: MoversRow) =>
            Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0)
        : (a: MoversRow, b: MoversRow) =>
            Math.abs(b.deltaTotal ?? 0) - Math.abs(a.deltaTotal ?? 0);

    return [...r].sort(sorter);
  }, [rows, q, sort, onlyGame]);

  const summary = useMemo(() => {
    if (!rows.length) return null;
    const net = rows.reduce((s, r) => s + (r.deltaTotal ?? 0), 0);
    const best = [...rows].sort((a, b) => (b.deltaTotal ?? 0) - (a.deltaTotal ?? 0))[0];
    const worst = [...rows].sort((a, b) => (a.deltaTotal ?? 0) - (b.deltaTotal ?? 0))[0];
    return { net, best, worst };
  }, [rows]);

  return (
    <div className="space-y-4">
      {/* Controls / Summary unchanged */}

      {/* Table */}
      <div className="rounded-2xl border border-white/20 bg-black/40 backdrop-blur-sm">
        {loading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 rounded bg-white/5" />
            ))}
          </div>
        ) : err ? (
          <div className="p-4 text-sm text-rose-200">{err}</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-sm text-white/70">
            No movers found for this window or filter.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-white/10 text-xs uppercase text-white/70">
              <tr>
                <th className="p-3">Card</th>
                <th className="p-3">Game</th>
                <th className="p-3">Qty</th>
                <th className="p-3">From</th>
                <th className="p-3">To</th>
                <th className="p-3">Move</th>
                <th className="p-3">Impact</th>
                <th className="p-3">Meta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filtered.map((r) => {
                const up = (r.deltaTotal ?? 0) >= 0;
                return (
                  <tr key={`${r.game}:${r.canonical_id}`} className="hover:bg-white/5">
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        {r.image_url && (
                          <img
                            src={r.image_url}
                            alt=""
                            className="h-10 w-7 rounded border border-white/20 object-contain bg-black/40"
                          />
                        )}
                        <div>
                          <div className="font-medium">
                            {r.display_name ?? r.canonical_id}
                          </div>
                          <div className="text-xs text-white/60">
                            {r.set_name}
                            {r.number ? ` • #${r.number}` : ""}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="p-3">{gameLabel(r.game)}</td>
                    <td className="p-3">{r.qty}</td>
                    <td className="p-3">{fmtUsd(r.from)}</td>
                    <td className="p-3">{fmtUsd(r.to)}</td>

                    <td className="p-3">
                      <span className={up ? "text-emerald-300" : "text-rose-300"}>
                        {fmtPct(r.changePct)}
                      </span>
                      <span className="ml-2 text-white/60">
                        ({fmtUsd(r.deltaEach)}/ea)
                      </span>
                    </td>

                    <td className="p-3">
                      <span className={`rounded border px-2 py-1 ${badgeClass(up ? "pos" : "neg")}`}>
                        {fmtUsd(r.deltaTotal)}
                      </span>
                    </td>

                    <td className="p-3">
                      {r.toSource && smallBadge(r.toSource)}
                      {r.toPriceType && smallBadge(r.toPriceType)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-xs text-white/60">
        Tip: “Biggest $ impact” reflects actual portfolio movement (price × quantity).
      </div>
    </div>
  );
}
