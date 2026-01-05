// src/app/cart/CheckoutButton.tsx
"use client";

import { useState } from "react";

export default function CheckoutButton({ disabled }: { disabled?: boolean }) {
  const [loading, setLoading] = useState(false);

  async function onCheckout() {
    try {
      setLoading(true);

      // ✅ Canonical: one endpoint
      const r = await fetch("/api/stripe/checkout/start", { method: "POST" });
      const j = await r.json().catch(() => ({}));

      if (!r.ok) throw new Error(j?.error || "Checkout failed");

      const url = typeof j?.url === "string" ? j.url : "";
      if (!url) throw new Error("Checkout failed: missing Stripe URL");

      window.location.assign(url);
    } catch (e: any) {
      alert(e?.message || "Checkout failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onCheckout}
      disabled={disabled || loading}
      className="mt-5 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
    >
      {loading ? "Redirecting…" : "Proceed to checkout"}
    </button>
  );
}
