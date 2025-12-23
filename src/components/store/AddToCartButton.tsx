"use client";

import { useState } from "react";

export default function AddToCartButton({
  listingId,
  disabled,
}: {
  listingId: string;
  disabled?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function add() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/cart/add-listing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listingId, quantity: 1 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to add to cart");
      setMsg("Added!");
      setTimeout(() => setMsg(null), 1500);
    } catch (e: any) {
      setMsg(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={add}
      className={[
        "flex-1 rounded-xl px-4 py-2 text-sm font-semibold",
        disabled
          ? "cursor-not-allowed bg-white/10 text-white/40"
          : "bg-indigo-600 hover:bg-indigo-500",
      ].join(" ")}
    >
      {loading ? "Adding..." : msg ? msg : "Add to cart"}
    </button>
  );
}
