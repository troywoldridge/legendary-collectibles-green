"use client";

import { useEffect, useMemo, useState } from "react";

type InsuranceItem = {
  game: string;
  card_id: string;
  quantity: number;
  market_each: number;
  market_total: number;
  source?: string | null;
};

type InsurancePayload = {
  asOf: string;
  threshold: number;
  totals: {
    marketValue: number;
    costBasis: number;
    unrealizedGain: number;
  };
  highValueItems: InsuranceItem[];
};

function usd(v: number | null | undefined) {
  if (v == null) return "—";
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function safeFetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const ct = res.headers.get("content-type") || "";
  const text = await res.text();
  const isJson = ct.includes("application/json") || ct.includes("application/ld+json");
  const body = isJson ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;

  return { ok: res.ok, status: res.status, contentType: ct, text, json: body };
}

export default function InsuranceInlinePanel({
  previewCount = 5,
  threshold = 250,
}: {
  previewCount?: number;
  threshold?: number;
}) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<InsurancePayload | null>(null);

  const url = useMemo(
    () => `/api/pro/insurance?threshold=${encodeURIComponent(String(threshold))}`,
    [threshold],
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr(null);
      setData(null);

      try {
        const out = await safeFetchJson(url);
        if (!alive) return;

        if (!out.ok) {
          const msg =
            (out.json && (out.json.error || out.json.message)) ||
            `Request failed (${out.status}).`;
          setErr(String(msg));
          return;
        }

        if (!out.json) {
          setErr(`Expected JSON but got ${out.contentType || "unknown content-type"}.`);
          return;
        }

        setData(out.json as InsurancePayload);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Failed to load insurance report.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [url]);

  const csvUrl = useMemo(
    () => `/api/pro/insurance?format=csv&threshold=${encodeURIComponent(String(threshold))}`,
    [threshold],
  );

  return (
    <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">Insurance snapshot</div>
          <div className="text-xs text-white/60">
            High-value list (threshold ${threshold}+). Great for documentation.
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={csvUrl}
            className="text-xs text-sky-300 hover:underline"
          >
            Download CSV
          </a>
          <a
            href={url}
            className="text-xs text-sky-300 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            Open raw
          </a>
        </div>
      </div>

      {loading && <div className="mt-3 text-sm text-white/70">Loading insurance totals…</div>}

      {!loading && err && (
        <div className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
          <div className="font-semibold">Insurance report unavailable</div>
          <div className="text-red-100/80">{err}</div>
        </div>
      )}

      {!loading && !err && data && (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-xs uppercase tracking-wide text-white/60">Market value</div>
              <div className="mt-1 text-lg font-semibold text-white">{usd(data.totals.marketValue)}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-xs uppercase tracking-wide text-white/60">Cost basis</div>
              <div className="mt-1 text-lg font-semibold text-white">{usd(data.totals.costBasis)}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-xs uppercase tracking-wide text-white/60">Unrealized gain</div>
              <div
                className={`mt-1 text-lg font-semibold ${
                  data.totals.unrealizedGain >= 0 ? "text-emerald-300" : "text-red-300"
                }`}
              >
                {usd(data.totals.unrealizedGain)}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-xs uppercase tracking-wide text-white/60">High-value items</div>
            {(!data.highValueItems || data.highValueItems.length === 0) ? (
              <div className="mt-2 text-sm text-white/70">
                No items above ${threshold} yet.
              </div>
            ) : (
              <div className="mt-2 overflow-hidden rounded-xl border border-white/10">
                <table className="w-full text-sm">
                  <thead className="bg-white/10 text-xs uppercase tracking-wide text-white/70">
                    <tr>
                      <th className="p-2 text-left">Item</th>
                      <th className="p-2 text-right">Qty</th>
                      <th className="p-2 text-right">Each</th>
                      <th className="p-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {data.highValueItems.slice(0, previewCount).map((x) => (
                      <tr key={`${x.game}:${x.card_id}`}>
                        <td className="p-2">
                          <div className="font-medium text-white/90">{x.card_id}</div>
                          <div className="text-xs text-white/60">{(x.game || "").toUpperCase()}</div>
                        </td>
                        <td className="p-2 text-right text-white/80">{x.quantity}</td>
                        <td className="p-2 text-right text-white/80">{usd(x.market_each)}</td>
                        <td className="p-2 text-right text-white/80">{usd(x.market_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-2 text-xs text-white/50">
            As of {new Date(data.asOf).toLocaleString()} • threshold ${data.threshold}+
          </div>
        </>
      )}
    </div>
  );
}
