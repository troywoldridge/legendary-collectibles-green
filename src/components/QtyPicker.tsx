"use client";

import React from "react";

type Props = {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
};

export default function QtyPicker({
  value,
  onChange,
  min = 1,
  max = 99,
  disabled,
}: Props) {
  const v = Number.isFinite(value) ? value : min;
  const atMin = v <= min;
  const atMax = v >= max;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={disabled || atMin}
        onClick={() => onChange(Math.max(min, v - 1))}
        className="h-10 w-10 rounded-xl border border-white/15 bg-white/5 text-white hover:bg-white/10 disabled:opacity-50"
        aria-label="Decrease quantity"
      >
        –
      </button>

      <div className="min-w-[56px] rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-center text-sm font-bold text-white">
        {v}
      </div>

      <button
        type="button"
        disabled={disabled || atMax}
        onClick={() => onChange(Math.min(max, v + 1))}
        className="h-10 w-10 rounded-xl border border-white/15 bg-white/5 text-white hover:bg-white/10 disabled:opacity-50"
        aria-label="Increase quantity"
      >
        +
      </button>
    </div>
  );
}
