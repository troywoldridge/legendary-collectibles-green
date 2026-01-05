"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

type Props = {
  productId: string;
  disabled?: boolean;
  quantity?: number;
};

export default function AddToCartButton({
  productId,
  disabled = false,
  quantity = 1,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const onAdd = React.useCallback(async () => {
    if (disabled || pending) return;

    setPending(true);
    setError(null);

    try {
      const res = await fetch("/api/cart/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId, quantity }),
      });

      if (!res.ok) {
        let msg = `Add to cart failed (${res.status})`;

        // try JSON error payload
        try {
          const data: unknown = await res.json();
          if (data && typeof data === "object") {
            const maybe = data as { error?: unknown; message?: unknown };
            if (typeof maybe.error === "string" && maybe.error) msg = maybe.error;
            else if (typeof maybe.message === "string" && maybe.message) msg = maybe.message;
          }
        } catch {
          // ignore JSON parse errors
        }

        throw new Error(msg);
      }

      router.refresh();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Add to cart failed";
      console.error("[AddToCartButton] error", err);
      setError(msg);
    } finally {
      setPending(false);
    }
  }, [disabled, pending, productId, quantity, router]);

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={onAdd}
        disabled={disabled || pending}
        className={
          disabled || pending
            ? "w-full rounded-2xl bg-white/30 px-4 py-3 text-sm font-semibold text-black/60 cursor-not-allowed"
            : "w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black hover:bg-white/90"
        }
      >
        {disabled ? "Sold out" : pending ? "Adding..." : "Add to cart"}
      </button>

      {error ? (
        <div className="mt-2 text-sm text-red-400">{error}</div>
      ) : null}
    </div>
  );
}
