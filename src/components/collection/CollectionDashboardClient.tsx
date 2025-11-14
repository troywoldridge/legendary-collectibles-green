"use client";

import { useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useCollectionDashboard } from "@/hooks/useCollectionDashboard";

function moneyFromCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

export default function CollectionDashboardClient() {
  const { loading, error, summary, history, recentlyAdded } =
    useCollectionDashboard();

  const mainValue = summary?.totalValueCents ?? 0;
  const totalCost = summary?.totalCostCents ?? 0;

  const { minVal, maxVal } = useMemo(() => {
    if (!history.length) {
      return { minVal: 0, maxVal: 0 };
    }
    let min = history[0].totalValueCents;
    let max = history[0].totalValueCents;
    for (const h of history) {
      if (h.totalValueCents < min) min = h.totalValueCents;
      if (h.totalValueCents > max) max = h.totalValueCents;
    }
    if (min === max) {
      // widen a bit so the line isn't flat at 0
      min = Math.max(0, min - 100);
      max = max + 100;
    }
    return { minVal: min, maxVal: max };
  }, [history]);

  const valueChange =
    history.length >= 2
      ? history[history.length - 1].totalValueCents -
        history[0].totalValueCents
      : 0;

  const byGameEntries = summary
    ? Object.entries(summary.byGame ?? {})
    : [];

  const lastN = history.slice(-30); // last 30 points for the chart

  return (
    <section className="mb-6 space-y-4 rounded-2xl border border-white/15 bg-black/40 p-4 backdrop-blur-md">
      {/* Top stat cards */}
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-white/60">
            Distinct items
          </div>
          <div className="mt-2 text-2xl font-bold text-white">
            {summary?.distinctItems ?? (loading ? "…" : 0)}
          </div>
          <div className="mt-1 text-xs text-white/60">
            Filtered by your current view
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-white/60">
            Total copies
          </div>
          <div className="mt-2 text-2xl font-bold text-white">
            {summary?.totalQuantity ?? (loading ? "…" : 0)}
          </div>
          <div className="mt-1 text-xs text-white/60">
            Sum of all quantities stored
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-white/60">
            <span>Est. collection value</span>
            {valueChange !== 0 && (
              <span
                className={
                  valueChange > 0
                    ? "text-emerald-300"
                    : "text-red-300"
                }
              >
                {valueChange > 0 ? "▲" : "▼"}{" "}
                {moneyFromCents(Math.abs(valueChange))}
              </span>
            )}
          </div>
          <div className="mt-2 text-2xl font-bold text-white">
            {summary
              ? moneyFromCents(mainValue)
              : loading
              ? "…"
              : "—"}
          </div>
          <div className="mt-1 text-xs text-white/60">
            Based on latest price × qty
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-white/60">
            By game (portfolio)
          </div>
          <div className="mt-2 space-y-1 text-xs text-white/80">
            {byGameEntries.length === 0 && !loading && (
              <div className="text-white/60">No items yet</div>
            )}
            {byGameEntries.slice(0, 4).map(([game, data]) => (
              <div key={game} className="flex justify-between">
                <span className="truncate pr-2">
                  {game === "pokemon"
                    ? "Pokémon"
                    : game === "mtg"
                    ? "MTG"
                    : game === "ygo" || game === "yugioh"
                    ? "Yu-Gi-Oh!"
                    : game}
                </span>
                <span className="text-white/70">
                  {data.quantity} •{" "}
                  {moneyFromCents(data.valueCents)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Chart + Recently Added */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.35fr)]">
        {/* Portfolio chart */}
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">
              Portfolio value (last {lastN.length || history.length || 0} days)
            </h2>
            <span className="text-xs text-white/60">
              {history.length === 0 && !loading
                ? "No history yet"
                : "Auto-updated when prices refresh"}
            </span>
          </div>

          <div className="relative h-32 w-full">
            {loading && history.length === 0 ? (
              <div className="grid h-full place-items-center text-xs text-white/60">
                Loading…
              </div>
            ) : history.length === 0 ? (
              <div className="grid h-full place-items-center text-xs text-white/60">
                Add items to see your collection’s value over time.
              </div>
            ) : (
              <svg
                viewBox="0 0 100 40"
                className="h-full w-full text-sky-300"
                preserveAspectRatio="none"
              >
                {/* background grid-ish line */}
                <line
                  x1="0"
                  y1="35"
                  x2="100"
                  y2="35"
                  stroke="currentColor"
                  strokeOpacity={0.25}
                  strokeWidth={0.4}
                />
                <path
                  d={buildPath(lastN, minVal, maxVal)}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
        </div>

        {/* Recently added */}
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">
              Recently added
            </h2>
            <Link
              href="/collection"
              className="text-xs text-sky-300 hover:underline"
            >
              View all
            </Link>
          </div>

          {loading && recentlyAdded.length === 0 ? (
            <div className="text-xs text-white/60">Loading…</div>
          ) : recentlyAdded.length === 0 ? (
            <div className="text-xs text-white/60">
              Add something from a card page to see it here.
            </div>
          ) : (
            <ul className="divide-y divide-white/10">
              {recentlyAdded.slice(0, 6).map((r) => (
                <li
                  key={r.id}
                  className="flex gap-2 py-2 text-xs text-white/90"
                >
                  <div className="relative h-12 w-9 shrink-0 overflow-hidden rounded">
                    {r.imageUrl ? (
                      <Image
                        src={r.imageUrl}
                        alt={r.cardName || "Card"}
                        fill
                        unoptimized
                        className="object-contain"
                        sizes="36px"
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center bg-black/40 text-[10px] text-white/60">
                        No image
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">
                      {r.cardName ?? r.cardId ?? "Unknown card"}
                    </div>
                    {r.setName && (
                      <div className="truncate text-white/60">
                        {r.setName}
                      </div>
                    )}
                    <div className="mt-0.5 flex items-center justify-between text-[11px] text-white/60">
                      <span>
                        Qty {r.quantity}
                        {r.lastValueCents != null &&
                          ` • ${moneyFromCents(
                            r.lastValueCents * r.quantity,
                          )}`}
                      </span>
                      {typeof r.createdAt === "string" && (
                        <span>
                          {new Date(
                            r.createdAt,
                          ).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-300">
          {error} (collection dashboard)
        </p>
      )}
    </section>
  );
}

function buildPath(
  history: { totalValueCents: number }[],
  minVal: number,
  maxVal: number,
): string {
  if (!history.length || maxVal <= minVal) return "";

  const span = maxVal - minVal || 1;
  const n = history.length;
  const points: string[] = [];

  history.forEach((p, idx) => {
    const x = (idx / Math.max(1, n - 1)) * 100;
    const norm = (p.totalValueCents - minVal) / span;
    const y = 35 - norm * 30; // 5–35 vertical
    points.push(`${idx === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`);
  });

  return points.join(" ");
}
