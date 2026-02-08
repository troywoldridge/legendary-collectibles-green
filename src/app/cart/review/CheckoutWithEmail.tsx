"use client";

import { useMemo, useState } from "react";

function isValidEmail(email: string) {
  // simple + safe
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function CheckoutWithEmail({
  disabled,
}: {
  disabled?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const emailOk = useMemo(() => {
    if (!email.trim()) return true; // allow empty; Stripe will collect
    return isValidEmail(email.trim());
  }, [email]);

  async function onCheckout() {
    try {
      setLoading(true);

      const payload: any = {};
      const e = email.trim();
      if (e) payload.email = e;

      const r = await fetch("/api/checkout/sessions", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
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

  return (
    <div className="grid gap-2">
      <label className="text-xs font-semibold text-white/80">
        Email for receipt (optional)
      </label>

      <input
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={[
          "h-11 w-full rounded-xl border bg-white/5 px-4 text-sm text-white placeholder:text-white/50",
          "focus:outline-none focus:ring-2 focus:ring-indigo-500/40",
          emailOk ? "border-white/15 focus:border-indigo-500" : "border-red-500/60 focus:border-red-500",
        ].join(" ")}
      />

      {!emailOk && (
        <div className="text-xs text-red-200/90">
          Please enter a valid email (or leave blank).
        </div>
      )}

      <button
        type="button"
        onClick={onCheckout}
        disabled={disabled || loading || !emailOk}
        className="mt-2 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
      >
        {loading ? "Redirecting…" : "Proceed to checkout"}
      </button>
    </div>
  );
}
