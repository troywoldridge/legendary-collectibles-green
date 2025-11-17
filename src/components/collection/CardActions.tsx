"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

type Props = {
  canSave: boolean;
  game: string;
  cardId: string;
  cardName?: string;
  setName?: string;
  imageUrl?: string | null;
};

type ApiError = {
  error?: string;
  message?: string;
  plan?: string;
  upgradeUrl?: string;
  limits?: {
    maxItems: number | null;
    maxCollections: number | null;
  };
  current?: {
    items: number;
    collections: number;
  };
};

export default function CardActions({
  canSave,
  game,
  cardId,
  cardName,
  setName,
  imageUrl,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [error, setError] = useState<ApiError | null>(null);

  if (!canSave) {
    return (
      <div className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/80">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>Sign in to save this card to your collection.</span>
          <Link
            href="/sign-in"
            className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  async function handleQuickAdd() {
    setStatus("idle");
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/collection/add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            game,
            cardId,
            cardName,
            setName,
            imageUrl,
            quantity: 1,
          }),
        });

        if (res.ok) {
          setStatus("success");
          return;
        }

        if (res.status === 403) {
          const data = (await res.json()) as ApiError;
          setError(data);
          setStatus("error");
          return;
        }

        const generic = (await res.json().catch(() => ({}))) as ApiError;
        setError(generic);
        setStatus("error");
      } catch (err) {
        console.error("CardActions quick add failed", err);
        setError({
          error: "Network error",
          message: "Something went wrong while saving this card.",
        });
        setStatus("error");
      }
    });
  }

  const showPlanError =
    status === "error" && error && error.error === "Plan limit reached";

  return (
    <div className="space-y-2">
      {/* Main action row */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleQuickAdd}
          disabled={isPending}
          className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-black shadow hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Adding…" : "Add to collection"}
        </button>

        {status === "success" && !showPlanError && (
          <span className="text-xs text-emerald-300">
            Added to your collection.
          </span>
        )}

        {status === "error" && !showPlanError && (
          <span className="text-xs text-red-300">
            {error?.message || "Could not save this card."}
          </span>
        )}
      </div>

      {/* Plan-limit banner (Free / Collector when limit is hit) */}
      {showPlanError && (
        <div className="rounded-lg border border-amber-400/60 bg-amber-500/15 px-3 py-2 text-xs text-amber-50">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-semibold">
                {error.plan
                  ? `${error.plan} plan limit reached`
                  : "Plan limit reached"}
              </div>
              <div className="mt-0.5 text-amber-100/90">
                {error.message ??
                  "You’ve hit the limit for your current plan."}
              </div>
              {error.limits && error.current && (
                <div className="mt-0.5 text-[11px] text-amber-100/80">
                  Items: {error.current.items}
                  {error.limits.maxItems != null
                    ? ` / ${error.limits.maxItems}`
                    : ""}{" "}
                  • Collections: {error.current.collections}
                  {error.limits.maxCollections != null
                    ? ` / ${error.limits.maxCollections}`
                    : ""}
                </div>
              )}
            </div>
            <div className="mt-1 sm:mt-0 flex shrink-0 items-center gap-2">
              <Link
                href={error.upgradeUrl ?? "/pricing"}
                className="inline-flex items-center justify-center rounded-md border border-amber-300/80 bg-amber-400/20 px-3 py-1 text-[11px] font-semibold text-amber-50 hover:bg-amber-400/30"
              >
                Upgrade plan
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
