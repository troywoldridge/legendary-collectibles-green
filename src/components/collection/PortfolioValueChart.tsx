"use client";

import { useMemo } from "react";

type Point = {
  date: string;       // "YYYY-MM-DD"
  costCents: number;
  valueCents: number;
};

type Props = {
  points: Point[];
};

function formatMoney(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function PortfolioValueChart({ points }: Props) {
  const { pathValue, pathCost, latest } = useMemo(() => {
    if (!points || points.length === 0) {
      return {
        pathValue: "",
        pathCost: "",
        latest: null as Point | null,
      };
    }

    const width = 400;
    const height = 140;
    const padX = 10;
    const padTop = 8;
    const padBottom = 20;
    const plotWidth = width - padX * 2;
    const plotHeight = height - padTop - padBottom;

    const maxVal = Math.max(
      ...points.map((p) => Math.max(p.costCents, p.valueCents))
    );
    const safeMax = maxVal > 0 ? maxVal : 1;
    const n = points.length;
    const stepX = n > 1 ? plotWidth / (n - 1) : 0;

    const toPath = (selector: (p: Point) => number) =>
      points
        .map((p, i) => {
          const x = padX + i * stepX;
          const value = selector(p);
          const norm = value / safeMax;
          const y = padTop + (1 - norm) * plotHeight;
          const cmd = i === 0 ? "M" : "L";
          return `${cmd}${x.toFixed(2)} ${y.toFixed(2)}`;
        })
        .join(" ");

    const pathValue = toPath((p) => p.valueCents);
    const pathCost = toPath((p) => p.costCents);
    const latest = points[points.length - 1];

    return { pathValue, pathCost, latest };
  }, [points]);

  if (!points || points.length < 2 || !latest) {
    return (
      <div className="flex h-24 items-center justify-center text-xs text-white/60">
        Not enough history yet. As you add more items (with cost and value),
        your portfolio chart will appear here.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-white/60">
            Current est. value
          </div>
          <div className="text-lg font-semibold text-white">
            {formatMoney(latest.valueCents)}
          </div>
        </div>
        <div className="text-[11px] text-white/60">
          Range: {points[0].date} → {points[points.length - 1].date}
        </div>
      </div>

      <svg viewBox="0 0 400 140" className="h-36 w-full" aria-hidden="true">
        {/* Baseline grid */}
        <line
          x1="10"
          y1="120"
          x2="390"
          y2="120"
          className="stroke-white/10"
          strokeWidth={1}
        />
        <line
          x1="10"
          y1="40"
          x2="390"
          y2="40"
          className="stroke-white/5"
          strokeWidth={1}
        />

        {/* Cost line */}
        <path
          d={pathCost}
          className="fill-none stroke-amber-300/80"
          strokeWidth={1.5}
        />

        {/* Value line */}
        <path
          d={pathValue}
          className="fill-none stroke-emerald-300"
          strokeWidth={2}
        />
      </svg>

      <div className="flex gap-4 text-[11px] text-white/60">
        <div className="flex items-center gap-1">
          <span className="inline-block h-2 w-4 rounded-full bg-emerald-300" />
          Value
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block h-2 w-4 rounded-full bg-amber-300" />
          Cost
        </div>
      </div>
    </div>
  );
}
