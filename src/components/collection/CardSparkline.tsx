// src/components/collection/CardSparkline.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type ApiPoint = {
  t: string;
  v: number | null;
};

type CardSparklineProps = {
  /**
   * IMPORTANT:
   * The sparkline API expects a *cardId* (the ID used in your history tables),
   * not a collection item id / slug.
   */
  cardId?: string;

  /**
   * Optional: "pokemon" | "yugioh" | "ygo"
   * Defaults to "pokemon".
   */
  game?: string | null;

  className?: string;

  /**
   * Kept for backwards compatibility, but NOT used for the sparkline request
   * unless you also pass cardId.
   */
  itemId?: string;
  id?: string;
};

export default function CardSparkline({
  cardId,
  game,
  className = "",
}: CardSparklineProps) {
  const resolvedGame = (game ?? "pokemon").toLowerCase();

  // Sparkline requires cardId (as used by tcg/ygo history tables)
  const resolvedCardId = useMemo(() => (cardId ? String(cardId) : null), [cardId]);

  const [values, setValues] = useState<number[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!resolvedCardId) return;

    const ac = new AbortController();

    async function load(activeCardId: string) {
      try {
        setError(false);

        const url =
          `/api/collection/sparkline` +
          `?game=${encodeURIComponent(resolvedGame)}` +
          `&cardId=${encodeURIComponent(activeCardId)}` +
          `&days=90`;

        const res = await fetch(url, { signal: ac.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = (await res.json()) as { points?: ApiPoint[] };

        const vals = (json.points ?? [])
          .map((p) => (typeof p.v === "number" ? p.v : null))
          .filter((v): v is number => v != null);

        setValues(vals.length >= 2 ? vals : null);
      } catch (err) {
        // Ignore abort errors
        if ((err as any)?.name === "AbortError") return;
        console.error("CardSparkline fetch failed", err);
        setError(true);
      }
    }

    load(resolvedCardId);

    return () => ac.abort();
  }, [resolvedCardId, resolvedGame]);

  // If no cardId, render nothing (prevents accidental 404 spam / bad requests)
  if (!resolvedCardId) return null;

  // No data yet / error → subtle placeholder
  if (!values || values.length < 2 || error) {
    return (
      <div className={`mt-1 text-[11px] text-white/35 ${className}`.trim()}>
        —
      </div>
    );
  }

  // Build simple SVG line chart
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const width = 80;
  const height = 24;
  const stepX = width / Math.max(1, values.length - 1);

  const coords = values.map((v, i) => {
    const x = i * stepX;
    const yNorm = (v - min) / range; // 0..1
    const y = height - yNorm * (height - 4) - 2; // padding
    return { x, y };
  });

  const d = coords
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

  const first = values[0];
  const last = values[values.length - 1];
  const diff = last - first;
  const pct = first !== 0 ? (diff / first) * 100 : 0;

  const trendClass =
    diff > 0 ? "text-emerald-300" : diff < 0 ? "text-red-300" : "text-white/60";

  return (
    <div className={`mt-1 flex items-center gap-1 ${className}`.trim()}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-6 w-20 text-sky-300/80"
        aria-hidden="true"
      >
        <path
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.4}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <span className={`text-[11px] ${trendClass}`}>
        {diff > 0 ? "▲" : diff < 0 ? "▼" : "—"} {Math.abs(pct).toFixed(1)}%
      </span>
    </div>
  );
}