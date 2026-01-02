"use client";

import { useMemo, useState } from "react";

const GAME_LABEL: Record<string, string> = {
  pokemon: "Pokémon",
  yugioh: "Yu-Gi-Oh!",
  mtg: "MTG",
};

type GameKey = "pokemon" | "yugioh" | "mtg";

type QuickAction =
  | ""
  | "movers7"
  | "movers30"
  | "taxLotsGame"
  | "taxLotsAll"
  | "highValueGame"
  | "alerts";

export default function DownloadsPanel() {
  const [game, setGame] = useState<GameKey>("yugioh");
  const [hv, setHv] = useState<number>(250);
  const [quick, setQuick] = useState<QuickAction>("");

  const gameName = useMemo(() => GAME_LABEL[game], [game]);

  function runQuick(action: QuickAction) {
    if (!action) return;

    const g = encodeURIComponent(game);
    const threshold = encodeURIComponent(String(hv));

    let href = "";

    switch (action) {
      case "movers7":
        href = `/api/pro/exports/movers?days=7&limit=200`;
        break;
      case "movers30":
        href = `/api/pro/exports/movers?days=30&limit=200`;
        break;
      case "taxLotsGame":
        href = `/api/pro/exports/tax-lots?game=${g}`;
        break;
      case "taxLotsAll":
        href = `/api/pro/exports/tax-lots`;
        break;
      case "highValueGame":
        href = `/api/pro/exports/high-value?threshold=${threshold}&game=${g}`;
        break;
      case "alerts":
        href = `/api/pro/exports/alerts`;
        break;
      default:
        return;
    }

    // trigger download/navigation
    window.location.href = href;

    // reset selector so user can pick again
    setQuick("");
  }

  return (
    <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Downloads</h2>
          <div className="text-sm text-white/70">
            Exports are live + collector-friendly (cost basis, market value, movers-ready).
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Quick Export */}
          <div className="flex items-center gap-2">
            <div className="text-xs text-white/60">Quick export</div>
            <select
              value={quick}
              onChange={(e) => {
                const v = e.target.value as QuickAction;
                setQuick(v);
                runQuick(v);
              }}
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm text-white outline-none"
            >
              <option value="">Choose…</option>
              <option value="movers7">Movers (7d) CSV</option>
              <option value="movers30">Movers (30d) CSV</option>
              <option value="taxLotsGame">{gameName} Tax Lots CSV</option>
              <option value="taxLotsAll">All Games Tax Lots CSV</option>
              <option value="highValueGame">{gameName} High-Value CSV (≥ {hv})</option>
              <option value="alerts">Alerts Backup CSV</option>
            </select>
          </div>

          {/* Game toggle */}
          <div className="inline-flex overflow-hidden rounded-xl border border-white/10">
            {(["pokemon", "yugioh", "mtg"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGame(g)}
                className={`px-3 py-1.5 text-sm transition ${
                  game === g
                    ? "bg-white/20 text-white"
                    : "bg-transparent text-white/80 hover:bg-white/10"
                }`}
              >
                {GAME_LABEL[g]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <a
          href={`/api/pro/exports/prices?game=${encodeURIComponent(game)}`}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white hover:border-white/20 hover:bg-white/10"
        >
          {gameName} Price Sheet (CSV)
          <div className="text-xs text-white/60">Your pricing export</div>
        </a>

        <a
          href={`/api/pro/exports/collection?game=${encodeURIComponent(game)}`}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white hover:border-white/20 hover:bg-white/10"
        >
          {gameName} Collection Export (CSV)
          <div className="text-xs text-white/60">Qty, cost basis, live market</div>
        </a>

        <a
          href={`/api/pro/exports/collection`}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white hover:border-white/20 hover:bg-white/10"
        >
          All Games Collection Export (CSV)
          <div className="text-xs text-white/60">Everything in one file</div>
        </a>

        <a
          href={`/api/pro/insurance?format=csv`}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white hover:border-white/20 hover:bg-white/10"
        >
          Insurance Report (High-Value CSV)
          <div className="text-xs text-white/60">Top insured items list</div>
        </a>

        <a
          href={`/api/pro/insurance`}
          target="_blank"
          rel="noreferrer"
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white hover:border-white/20 hover:bg-white/10"
        >
          Insurance Summary (JSON)
          <div className="text-xs text-white/60">Totals + breakdown</div>
        </a>

        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-white hover:border-white/20 hover:bg-white/10"
        >
          Print Summary
          <div className="text-xs text-white/60">Use for insurance paperwork</div>
        </button>
      </div>

      <div className="mt-6 rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-white">Pro Exports</div>
            <div className="text-xs text-white/60">
              These are the “why Pro is Pro” downloads.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-xs text-white/60">High-value threshold</div>
            <input
              type="number"
              min={1}
              step={1}
              value={hv}
              onChange={(e) => setHv(Number(e.target.value || 250))}
              className="w-24 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm text-white outline-none"
            />
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <a
            href={`/api/pro/exports/movers?days=7&limit=200`}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white hover:border-white/20 hover:bg-white/10"
          >
            Movers (7d) Export (CSV)
            <div className="text-xs text-white/60">Biggest $ swings in your holdings</div>
          </a>

          <a
            href={`/api/pro/exports/movers?days=30&limit=200`}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white hover:border-white/20 hover:bg-white/10"
          >
            Movers (30d) Export (CSV)
            <div className="text-xs text-white/60">Longer trend shifts</div>
          </a>

          <a
            href={`/api/pro/exports/tax-lots?game=${encodeURIComponent(game)}`}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white hover:border-white/20 hover:bg-white/10"
          >
            {gameName} Tax Lots (CSV)
            <div className="text-xs text-white/60">Cost basis + market + gain/ROI</div>
          </a>

          <a
            href={`/api/pro/exports/tax-lots`}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white hover:border-white/20 hover:bg-white/10"
          >
            All Games Tax Lots (CSV)
            <div className="text-xs text-white/60">Best for accounting & reselling</div>
          </a>

          <a
            href={`/api/pro/exports/high-value?threshold=${encodeURIComponent(
              String(hv),
            )}&game=${encodeURIComponent(game)}`}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white hover:border-white/20 hover:bg-white/10"
          >
            {gameName} High-Value Items (CSV)
            <div className="text-xs text-white/60">Filters by {hv.toFixed(0)}+ market total</div>
          </a>

          <a
            href={`/api/pro/exports/alerts`}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white hover:border-white/20 hover:bg-white/10"
          >
            Price Alerts Backup (CSV)
            <div className="text-xs text-white/60">Restore/migrate alerts anytime</div>
          </a>
        </div>
      </div>

      <div className="mt-3 text-xs text-white/50">
        Next upgrade: one-click “Pro Pack” ZIP (collection + tax lots + insurance + alerts).
      </div>
    </div>
  );
}
