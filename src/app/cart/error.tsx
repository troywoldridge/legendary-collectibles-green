// src/app/cart/error.tsx
"use client";

import { useEffect } from "react";

export default function CartError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[/cart] error boundary:", error);
  }, [error]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">Cart failed to load</h1>
      <p className="mt-3 text-white/80">
        Something crashed while rendering the cart.
      </p>

      <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-black/40 p-4 text-xs text-white/80">
        {error.message}
        {error.digest ? `\n\ndigest: ${error.digest}` : ""}
      </pre>

      <button
        onClick={() => reset()}
        className="mt-6 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
      >
        Try again
      </button>
    </main>
  );
}
