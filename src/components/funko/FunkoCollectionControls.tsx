// src/components/funko/FunkoCollectionControls.tsx
"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

type Props = {
  signedIn: boolean;
  itemId: string;
  className?: string;
};

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Request failed (${res.status}): ${text || res.statusText}`);
  }
  return res;
}

export default function FunkoCollectionControls({ signedIn, itemId, className }: Props) {
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <div className={className}>
        <Link
          href="/sign-in"
          className="inline-flex rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs text-white/85 hover:bg-white/10"
          prefetch={false}
        >
          Sign in to manage collection
        </Link>
      </div>
    );
  }

  const run = (fn: () => Promise<void>) => {
    setErr(null);
    startTransition(async () => {
      try {
        await fn();
        // keep it simple + reliable: refresh UI
        window.location.reload();
      } catch (e: any) {
        setErr(e?.message || "Something went wrong.");
      }
    });
  };

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isPending}
          className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs text-white hover:bg-white/15 disabled:opacity-40"
          onClick={() =>
            run(async () => {
              await postJson("/api/collection/funko", {
                itemId,
                variantType: "normal",
                qty: 1,
                mode: "add",
              });
            })
          }
        >
          ➕ {isPending ? "Working…" : "Add to collection"}
        </button>

        <button
          type="button"
          disabled={isPending}
          className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs text-white/85 hover:bg-white/10 disabled:opacity-40"
          onClick={() =>
            run(async () => {
              await postJson("/api/collection/funko", {
                itemId,
                variantType: "normal",
                qty: 1,
                mode: "decrement",
              });
            })
          }
        >
          ➖ Remove 1
        </button>

        <button
          type="button"
          disabled={isPending}
          className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs text-white/85 hover:bg-white/10 disabled:opacity-40"
          onClick={() =>
            run(async () => {
              if (!confirm("Delete this item from your collection (all variants)?")) return;
              const res = await fetch(`/api/collection/funko?itemId=${encodeURIComponent(itemId)}`, {
                method: "DELETE",
              });
              if (!res.ok) {
                const text = await res.text().catch(() => "");
                throw new Error(`Delete failed (${res.status}): ${text || res.statusText}`);
              }
            })
          }
        >
          🗑️ Delete from collection
        </button>
      </div>

      {err ? <div className="mt-2 text-xs text-red-300">{err}</div> : null}
    </div>
  );
}
