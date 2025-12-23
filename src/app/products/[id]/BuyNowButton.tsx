"use client";

import { useState } from "react";
import { getSelectedQty } from "./QtyPicker";

export default function BuyNowButton({ productId, disabled }: { productId: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function buyNow() {
    try {
      setErr(null);
      setBusy(true);

      const quantity = getSelectedQty(1);

      const r = await fetch("/api/checkout/buy-now", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId, quantity }),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "Checkout failed");

      if (j?.url) window.location.href = j.url;
      else throw new Error("Missing checkout url");
    } catch (e: any) {
      setErr(e?.message || "Checkout failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={buyNow}
        disabled={disabled || busy}
        className={
          disabled
            ? "w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm font-extrabold text-white/50"
            : "w-full rounded-lg border border-white/40 bg-emerald-600/80 px-4 py-2 text-sm font-extrabold text-white hover:bg-emerald-600 disabled:opacity-50"
        }
      >
        {disabled ? "Out of Stock" : busy ? "Redirecting…" : "Buy Now"}
      </button>

      {err ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
          {err}
        </div>
      ) : null}
    </div>
  );
}
