"use client";

import { useEffect, useState } from "react";

const KEY = "lc_product_qty";

export default function QtyPicker({ max, disabled }: { max: number; disabled?: boolean }) {
  const [qty, setQty] = useState(1);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      const n = raw ? parseInt(raw, 10) : 1;
      if (Number.isFinite(n)) setQty(Math.max(1, Math.min(max, n)));
    } catch {}
  }, [max]);

  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, String(qty));
    } catch {}
  }, [qty]);

  return (
    <div className="flex items-center justify-between rounded-xl border border-white/15 bg-white/5 px-3 py-2">
      <div className="text-sm font-semibold text-white">Quantity</div>

      <div className="flex items-center rounded-lg border border-white/20 bg-black/30 overflow-hidden">
        <button
          type="button"
          disabled={disabled || qty <= 1}
          onClick={() => setQty((q) => Math.max(1, q - 1))}
          className="px-3 py-2 text-sm font-extrabold text-white/90 hover:bg-white/10 disabled:opacity-40"
          aria-label="Decrease quantity"
        >
          −
        </button>

        <input
          value={qty}
          onChange={(e) => {
            const n = parseInt(e.target.value || "1", 10);
            setQty(Math.max(1, Math.min(max, Number.isFinite(n) ? n : 1)));
          }}
          disabled={disabled}
          className="w-14 bg-transparent text-center text-sm font-extrabold text-white outline-none"
          inputMode="numeric"
          aria-label="Quantity"
        />

        <button
          type="button"
          disabled={disabled || qty >= max}
          onClick={() => setQty((q) => Math.min(max, q + 1))}
          className="px-3 py-2 text-sm font-extrabold text-white/90 hover:bg-white/10 disabled:opacity-40"
          aria-label="Increase quantity"
        >
          +
        </button>
      </div>
    </div>
  );
}

export function getSelectedQty(fallback = 1) {
  try {
    const raw = sessionStorage.getItem(KEY);
    const n = raw ? parseInt(raw, 10) : fallback;
    return Math.max(1, Number.isFinite(n) ? n : fallback);
  } catch {
    return fallback;
  }
}
