"use client";

import { useState } from "react";

export default function CheckoutButton({
  disabled,
  className,
}: {
  disabled?: boolean;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);

  async function onCheckout() {
    if (loading) return;
    setLoading(true);

    try {
      const res = await fetch("/api/checkout/cart", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data?.error || "Checkout failed");
        return;
      }

      if (!data?.url) {
        alert("Checkout failed: missing Stripe URL");
        return;
      }

      // ✅ Send the user to Stripe Checkout
      window.location.href = data.url;
    } catch (e) {
      console.error(e);
      alert("Checkout failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onCheckout}
      disabled={disabled || loading}
      className={
        className ??
        "w-full rounded-lg bg-indigo-600/80 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-600 disabled:opacity-50"
      }
    >
      {loading ? "Redirecting…" : "Proceed to Checkout"}
    </button>
  );
}
