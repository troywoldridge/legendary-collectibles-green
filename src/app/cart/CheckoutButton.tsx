"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CheckoutButton({
  disabled,
  mode = "review",
}: {
  disabled?: boolean;
  mode?: "review" | "checkout";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onClick() {
    if (mode === "review") {
      router.push("/cart/review");
      return;
    }

    try {
      setLoading(true);

      const r = await fetch("/api/checkout/sessions", {
        method: "POST",
        headers: { accept: "application/json" },
      });

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

  const label =
    mode === "review"
      ? "Review order"
      : loading
        ? "Redirecting…"
        : "Proceed to checkout";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className="mt-5 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
    >
      {label}
    </button>
  );
}
