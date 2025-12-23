"use client";

import { useState } from "react";
import Link from "next/link";
import { getSelectedQty } from "@/app/products/[id]/QtyPicker";


export default function AddToCartButton({
  productId,
  disabled,
  defaultQty = 1,
}: {
  productId: string;
  disabled?: boolean;
  defaultQty?: number;
}) {
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [qty, setQty] = useState<number>(defaultQty);

  async function add() {
    try {
      setErr(null);
      setBusy(true);
      setAdded(false);

      const quantity = getSelectedQty(1);


      const r = await fetch("/api/cart/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId, quantity }),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "Failed to add to cart");

      setAdded(true);
      setTimeout(() => setAdded(false), 1200);
    } catch (e: any) {
      setErr(e?.message || "Failed to add to cart");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-lg border border-white/20 bg-white/5 overflow-hidden">
          <button
            type="button"
            disabled={disabled || busy || qty <= 1}
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            className="px-3 py-2 text-sm font-extrabold text-white/90 hover:bg-white/10 disabled:opacity-40"
            aria-label="Decrease quantity"
          >
            −
          </button>
          <input
            value={qty}
            onChange={(e) => setQty(Math.max(1, Math.min(99, parseInt(e.target.value || "1", 10))))}
            disabled={disabled || busy}
            className="w-14 bg-transparent text-center text-sm font-extrabold text-white outline-none"
            inputMode="numeric"
            aria-label="Quantity"
          />
          <button
            type="button"
            disabled={disabled || busy || qty >= 99}
            onClick={() => setQty((q) => Math.min(99, q + 1))}
            className="px-3 py-2 text-sm font-extrabold text-white/90 hover:bg-white/10 disabled:opacity-40"
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>

        <button
          type="button"
          onClick={add}
          disabled={disabled || busy}
          className={
            disabled
              ? "flex-1 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm font-extrabold text-white/50"
              : "flex-1 rounded-lg border border-white/40 bg-indigo-600/80 px-3 py-2 text-sm font-extrabold text-white hover:bg-indigo-600 disabled:opacity-50"
          }
        >
          {disabled ? "Out of Stock" : busy ? "Adding…" : added ? "Added ✓" : "Add to Cart"}
        </button>
      </div>

      {err ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
          {err}{" "}
          <Link href="/cart" className="underline underline-offset-2 font-semibold">
            View cart
          </Link>
        </div>
      ) : null}

      {!err && added ? (
        <div className="text-xs text-white/70">
          Added to cart.{" "}
          <Link href="/cart" className="underline underline-offset-2 font-semibold text-white">
            View cart →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
