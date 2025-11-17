// src/components/collection/CardSparkline.tsx
"use client";

import { useEffect, useState } from "react";

type ApiPoint = {
  as_of_date: string;
  total_value_cents: number | null;
};

type CardSparklineProps = {
  /** Prefer passing the collection item id */
  itemId?: string;
  /** Optional fallbacks */
  id?: string;
  cardId?: string;
  game?: string | null;
  className?: string;
};

export default function CardSparkline(props: CardSparklineProps) {
  const id = props.itemId ?? props.cardId ?? props.id ?? null;
  const className = props.className ?? "";

  const [values, setValues] = useState<number[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    async function load(activeId: string) {
      try {
        setError(false);

        const res = await fetch(
          `/api/collection/item-valuations?itemId=${encodeURIComponent(
            activeId,
          )}`,
          { cache: "no-store" },
        );

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = (await res.json()) as { points: ApiPoint[] };

        const vals = (json.points || [])
          .map((p) =>
            typeof p.total_value_cents === "number"
              ? p.total_value_cents
              : null,
          )
          .filter((v): v is number => v != null);

        if (!cancelled) {
          setValues(vals.length >= 2 ? vals : null);
        }
      } catch (err) {
        console.error("CardSparkline fetch failed", err);
        if (!cancelled) setError(true);
      }
    }

    // pass the narrowed string into the loader
    load(id);

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) return null;

  // No data yet / error → show a subtle placeholder
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
    const y = height - yNorm * (height - 4) - 2; // small padding
    return { x, y };
  });

  const d = coords
    .map((p, i) =>
      `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`,
    )
    .join(" ");

  const first = values[0];
  const last = values[values.length - 1];
  const diff = last - first;
  const pct = first !== 0 ? (diff / first) * 100 : 0;

  const trendClass =
    diff > 0
      ? "text-emerald-300"
      : diff < 0
      ? "text-red-300"
      : "text-white/60";

  return (
    <div
      className={`mt-1 flex items-center gap-1 ${className}`.trim()}
    >
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
        {diff > 0 ? "▲" : diff < 0 ? "▼" : "—"}{" "}
        {Math.abs(pct).toFixed(1)}%
      </span>
    </div>
  );
}
