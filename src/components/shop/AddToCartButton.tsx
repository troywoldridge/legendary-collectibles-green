// src/components/shop/AddToCartButton.tsx
"use client";

import { useMemo, useState } from "react";

type Props = {
  productId: string;
  availableQty?: number; // optional
  className?: string;
};

export default function AddToCartButton({ productId, availableQty, className }: Props) {
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState(false);
  const disabled = useMemo(() => {
    if (loading) return true;
    if (typeof availableQty === "number" && availableQty <= 0) return true;
    return false;
  }, [loading, availableQty]);

  async function onClick() {
    try {
      setLoading(true);
      setAdded(false);

      const res = await fetch("/api/cart/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId, quantity: 1 }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to add");

      setAdded(true);
      // If you have a cart UI that listens for events, this helps:
      window.dispatchEvent(new CustomEvent("lc:cart-updated"));
    } catch (e: any) {
      alert(e?.message ?? "Failed to add to cart");
    } finally {
      setLoading(false);
    }
  }

  const label =
    typeof availableQty === "number" && availableQty <= 0
      ? "Out of stock"
      : loading
      ? "Adding…"
      : added
      ? "Added ✓"
      : "Add to cart";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        className ??
        "rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
      }
      aria-disabled={disabled}
    >
      {label}
    </button>
  );
}
