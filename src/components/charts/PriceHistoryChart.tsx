"use client";

import * as React from "react";

type Point = {
  as_of_date: string; // YYYY-MM-DD
  value: number; // dollars
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function niceStep(range: number, targetTicks: number) {
  if (!Number.isFinite(range) || range <= 0) return 1;
  const rough = range / Math.max(1, targetTicks);
  const pow10 = Math.pow(10, Math.floor(Math.log10(rough)));
  const x = rough / pow10;
  const nice =
    x <= 1 ? 1 :
    x <= 2 ? 2 :
    x <= 5 ? 5 :
    10;
  return nice * pow10;
}

function formatMoney(v: number, currency: string) {
  const cur = (currency || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: cur,
      maximumFractionDigits: v < 1 ? 2 : 2,
    }).format(v);
  } catch {
    // fallback if unknown currency
    return `${cur} ${v.toFixed(2)}`;
  }
}

function parseDate(s: string) {
  // s = YYYY-MM-DD
  const t = Date.parse(s + "T00:00:00Z");
  return Number.isFinite(t) ? t : NaN;
}

function formatTickDate(iso: string, mode: "daily" | "weekly" | "monthly") {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;

  if (mode === "monthly") {
    return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  }
  if (mode === "weekly") {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function pickTickMode(points: Point[]) {
  // Decide tick density based on span
  if (points.length < 2) return "daily" as const;

  const t0 = parseDate(points[0].as_of_date);
  const t1 = parseDate(points[points.length - 1].as_of_date);
  const days = Math.max(1, Math.round((t1 - t0) / 86400000));

  if (days > 365) return "monthly" as const;
  if (days > 120) return "weekly" as const;
  if (days > 45) return "weekly" as const;
  return "daily" as const;
}

function buildXTicks(points: Point[], mode: "daily" | "weekly" | "monthly") {
  if (points.length === 0) return [];

  // We'll derive ticks from actual points (keeps it simple & stable)
  const n = points.length;

  let step = 1;
  if (mode === "monthly") step = Math.max(1, Math.floor(n / 6));
  else if (mode === "weekly") step = Math.max(1, Math.floor(n / 6));
  else step = Math.max(1, Math.floor(n / 5));

  const out: Array<{ idx: number; label: string }> = [];
  for (let i = 0; i < n; i += step) {
    out.push({ idx: i, label: formatTickDate(points[i].as_of_date, mode) });
  }

  // Ensure last tick exists
  if (out.length && out[out.length - 1].idx !== n - 1) {
    out.push({ idx: n - 1, label: formatTickDate(points[n - 1].as_of_date, mode) });
  }
  return out;
}

export default function PriceHistoryChart(props: {
  title?: string;
  points: Point[];
  currency: string;
  height?: number; // px
}) {
  const { title = "Price History", points, currency, height = 280 } = props;

  const w = 900; // viewBox width
  const h = height; // viewBox height
  const padL = 64;
  const padR = 18;
  const padT = 18;
  const padB = 48;

  const usableW = w - padL - padR;
  const usableH = h - padT - padB;

  const clean = (points || [])
    .map((p) => ({ ...p, value: Number(p.value) }))
    .filter((p) => Number.isFinite(p.value));

  const minV = clean.length ? Math.min(...clean.map((p) => p.value)) : 0;
  const maxV = clean.length ? Math.max(...clean.map((p) => p.value)) : 0;

  // Expand range a bit for breathing room
  const range = Math.max(0.01, maxV - minV);
  const yMin = Math.max(0, minV - range * 0.08);
  const yMax = maxV + range * 0.12;

  // Y ticks
  const targetTicks = 5;
  const step = niceStep(yMax - yMin, targetTicks);
  const y0 = Math.floor(yMin / step) * step;
  const yTicks: number[] = [];
  for (let v = y0; v <= yMax + step * 0.5; v += step) yTicks.push(v);

  const n = clean.length;
  const mode = pickTickMode(clean);
  const xTicks = buildXTicks(clean, mode);

  function xAt(i: number) {
    if (n <= 1) return padL;
    return padL + (i / (n - 1)) * usableW;
  }

  function yAt(v: number) {
    const t = (v - yMin) / Math.max(0.0001, yMax - yMin);
    return padT + (1 - clamp(t, 0, 1)) * usableH;
  }

  // Build line path
  const d = clean
    .map((p, i) => {
      const x = xAt(i);
      const y = yAt(p.value);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  // Area path (down to baseline)
  const area =
    clean.length >= 2
      ? `${d} L ${xAt(n - 1).toFixed(2)} ${(padT + usableH).toFixed(2)} L ${xAt(0).toFixed(2)} ${(padT + usableH).toFixed(2)} Z`
      : "";

  // Hover state
  const [hoverIdx, setHoverIdx] = React.useState<number | null>(null);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!clean.length) return;
    const rect = (e.currentTarget as any).getBoundingClientRect?.();
    if (!rect) return;

    const px = e.clientX - rect.left;
    const rx = clamp(px / rect.width, 0, 1);
    const idx = Math.round(rx * (clean.length - 1));
    setHoverIdx(clamp(idx, 0, clean.length - 1));
  };

  const onLeave = () => setHoverIdx(null);

  const hover = hoverIdx == null ? null : clean[hoverIdx] ?? null;
  const hx = hoverIdx == null ? null : xAt(hoverIdx);
  const hy = hoverIdx == null || !hover ? null : yAt(hover.value);

  return (
    <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm text-white">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <div className="text-xs text-white/60">
            {clean.length ? `${clean.length} points` : "No history yet"} • {currency.toUpperCase()}
          </div>
        </div>

        {hover ? (
          <div className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-xs">
            <div className="text-white/80">{hover.as_of_date}</div>
            <div className="text-sm font-semibold">{formatMoney(hover.value, currency)}</div>
          </div>
        ) : (
          <div className="text-xs text-white/50">Hover the chart for exact values</div>
        )}
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="min-w-[720px] w-full"
          onMouseMove={onMove}
          onMouseLeave={onLeave}
          role="img"
          aria-label="Price history chart"
        >
          {/* Background */}
          <rect x="0" y="0" width={w} height={h} fill="transparent" />

          {/* Grid + Y labels */}
          {yTicks.map((v, i) => {
            const y = yAt(v);
            return (
              <g key={i}>
                <line x1={padL} y1={y} x2={w - padR} y2={y} stroke="rgba(255,255,255,0.10)" />
                <text
                  x={padL - 10}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="rgba(255,255,255,0.65)"
                >
                  {formatMoney(v, currency)}
                </text>
              </g>
            );
          })}

          {/* X axis line */}
          <line x1={padL} y1={padT + usableH} x2={w - padR} y2={padT + usableH} stroke="rgba(255,255,255,0.15)" />

          {/* X labels */}
          {xTicks.map((t, i) => {
            const x = xAt(t.idx);
            return (
              <g key={i}>
                <line x1={x} y1={padT + usableH} x2={x} y2={padT + usableH + 6} stroke="rgba(255,255,255,0.20)" />
                <text
                  x={x}
                  y={h - 18}
                  textAnchor="middle"
                  fontSize="11"
                  fill="rgba(255,255,255,0.65)"
                >
                  {t.label}
                </text>
              </g>
            );
          })}

          {/* Area fill */}
          {area ? <path d={area} fill="rgba(255,255,255,0.07)" /> : null}

          {/* Line */}
          {d ? <path d={d} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2.2" /> : null}

          {/* Points */}
          {clean.map((p, i) => {
            const x = xAt(i);
            const y = yAt(p.value);
            const isHover = hoverIdx === i;
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={isHover ? 4.2 : 2.6}
                fill={isHover ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.6)"}
              />
            );
          })}

          {/* Hover crosshair */}
          {hx != null && hy != null ? (
            <g>
              <line x1={hx} y1={padT} x2={hx} y2={padT + usableH} stroke="rgba(255,255,255,0.20)" />
              <line x1={padL} y1={hy} x2={w - padR} y2={hy} stroke="rgba(255,255,255,0.20)" />
            </g>
          ) : null}
        </svg>
      </div>
    </div>
  );
}
