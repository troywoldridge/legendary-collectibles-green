"use client";

import Link from "next/link";
import { useState } from "react";

const GAME_LABEL: Record<string, string> = {
  pokemon: "Pokémon",
  yugioh: "Yu-Gi-Oh!",
  mtg: "MTG",
};

export default function DownloadsPanel() {
  const [game, setGame] = useState<"pokemon" | "yugioh" | "mtg">("yugioh");
  return (
    <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Downloads</h2>

        <div className="inline-flex overflow-hidden rounded-xl border border-white/10">
          {(["pokemon","yugioh","mtg"] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGame(g)}
              className={`px-3 py-1.5 text-sm transition ${game === g ? "bg-white/20 text-white" : "bg-transparent text-white/80 hover:bg-white/10"}`}
            >
              {GAME_LABEL[g]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Link
          href={`/api/pro/exports/prices?game=${game}`}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 hover:border-white/20 hover:bg-white/10 text-white"
        >
          {GAME_LABEL[game]} Price Sheet (CSV)
        </Link>
        <Link
          href="/api/pro/collection/export"
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 hover:border-white/20 hover:bg-white/10 text-white"
        >
          Collection Export (CSV)
        </Link>
        <Link
          href="/api/pro/collection/insurance-pdf"
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 hover:border-white/20 hover:bg-white/10 text-white"
        >
          Insurance Report (PDF)
        </Link>
      </div>
    </div>
  );
}
