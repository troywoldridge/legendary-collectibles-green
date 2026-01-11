// src/app/cart/CheckoutButton.tsx
"use client";

import { useState } from "react";

export default function CheckoutButton({ disabled }: { disabled?: boolean }) {
  const [loading, setLoading] = useState(false);

  async function onCheckout() {
    try {
      setLoading(true);

      // ✅ canonical endpoint
      const r = await fetch("/api/checkout/sessions", {
        method: "POST",
        redirect: "manual", // important so we can read Location
      });

      // In many browsers, cross-origin redirects can be "opaque".
      // But for Stripe Checkout, Next will reply with 303 + Location,
      // and we can just follow it ourselves.
      const loc = r.headers.get("location") || r.headers.get("Location") || "";

      if (r.status === 303 && loc) {
        window.location.assign(loc);
        return;
      }

      // Some runtimes auto-follow; if so, you might see ok but no location.
      // Fall back to JSON error if present.
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "Checkout failed");

      // If we got JSON with a url (legacy), follow it
      const url = typeof j?.url === "string" ? j.url : "";
      if (url) window.location.assign(url);
      else throw new Error("Checkout failed");
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
