// src/app/shop/_components/AddToCartWithQty.tsx
"use client";

import React, { useMemo, useState } from "react";
import QtyPicker from "@/components/QtyPicker";

type Props = {
  productId: string;
  availableQty: number | null; // products.quantity
  disabled?: boolean;          // ✅ allow parent page to block add (no price, inactive, etc.)
};

async function safeJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) throw new Error(`Empty response (status ${res.status})`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Non-JSON response (status ${res.status})`);
  }
}

export default function AddToCartWithQty({ productId, availableQty, disabled }: Props) {
  const max = useMemo(() => {
    const n = Number(availableQty ?? 0);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(99, Math.floor(n));
  }, [availableQty]);

  const outOfStock = max <= 0;
  const blocked = !!disabled || outOfStock;

  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function add() {
    if (busy || blocked) return;

    setBusy(true);
    setMsg(null);

    try {
      const desired = Math.max(1, Math.min(qty, max || 1));

      const res = await fetch("/api/cart/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity: desired }),
      });

      const data = await safeJson<any>(res);

      if (!res.ok) {
        if (res.status === 409 && data?.available != null) {
          setMsg(
            `Only ${data.available} available. You already have ${data.inCart ?? 0} in your cart.`
          );
        } else {
          setMsg(data?.error || "Failed to add to cart");
        }
        return;
      }

      setMsg("Added to cart ✅");
    } catch (e: any) {
      setMsg(e?.message || "Failed to add to cart");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <QtyPicker
          value={qty}
          onChange={setQty}
          min={1}
          max={max > 0 ? max : 1}
          disabled={busy || blocked}
        />

        <button
          type="button"
          onClick={add}
          disabled={busy || blocked}
          className="h-10 rounded-xl bg-indigo-600 px-5 text-sm font-extrabold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Adding…" : disabled ? "Unavailable" : outOfStock ? "Out of stock" : "Add to cart"}
        </button>

        {max > 0 && (
          <div className="text-sm text-white/70">
            In stock: <span className="font-semibold text-white">{max}</span>
          </div>
        )}
      </div>

      {msg && <div className="text-sm text-white/80">{msg}</div>}
      {max > 0 && max <= 3 && <div className="text-xs text-amber-200/90">Only {max} left</div>}
    </div>
  );
}
