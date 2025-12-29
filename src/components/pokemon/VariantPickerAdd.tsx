// src/components/pokemon/VariantPickerAdd.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import AddToCollectionButton from "@/components/collection/AddToCollectionButton";
import type { PokemonVariants } from "@/components/pokemon/VariantChips";

type VariantTypeDb = "normal" | "holofoil" | "reverse_holofoil" | "first_edition" | "promo";

function variantLabel(v: VariantTypeDb) {
  switch (v) {
    case "holofoil":
      return "Holo";
    case "reverse_holofoil":
      return "Reverse";
    case "first_edition":
      return "1st Ed";
    case "promo":
      return "Promo";
    default:
      return "Normal";
  }
}

/** Strict boolean interpretation (prevents !!"f" === true) */
function truthy(v: unknown): boolean {
  if (v === true) return true;
  if (v === false || v == null) return false;
  if (typeof v === "number") return v === 1;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s === "t" || s === "true" || s === "1" || s === "yes" || s === "on";
  }
  return false;
}

function enabled(variantType: VariantTypeDb, variants: PokemonVariants) {
  if (!variants) return false;

  // tcg_card_variants columns: normal, reverse, holo, first_edition, w_promo
  if (variantType === "normal") return truthy(variants.normal);
  if (variantType === "holofoil") return truthy(variants.holo);
  if (variantType === "reverse_holofoil") return truthy(variants.reverse);
  if (variantType === "first_edition") return truthy(variants.first_edition);
  if (variantType === "promo") return truthy(variants.w_promo);

  return false;
}

/** Normalize ownedCounts keys (handles null/empty keys coming from DB) */
function normalizeOwnedCounts(raw?: Record<string, number>) {
  const out: Record<string, number> = {};
  if (!raw) return out;
  for (const [kRaw, vRaw] of Object.entries(raw)) {
    const k = String(kRaw ?? "").trim().toLowerCase() || "normal";
    const qty = Number(vRaw) || 0;
    if (qty) out[k] = (out[k] ?? 0) + qty;
  }
  return out;
}

export default function VariantPickerAdd({
  variants,
  ownedCounts,
  canSave,
  cardId,
  cardName,
  setName,
  imageUrl,
}: {
  variants: PokemonVariants;
  ownedCounts?: Record<string, number>;
  canSave: boolean;
  cardId: string;
  cardName: string;
  setName?: string | null;
  imageUrl?: string | null;
}) {
  const keys: VariantTypeDb[] = ["normal", "holofoil", "reverse_holofoil", "first_edition", "promo"];

  const owned = useMemo(() => normalizeOwnedCounts(ownedCounts), [ownedCounts]);

  const available = useMemo(() => {
    return keys.filter((k) => enabled(k, variants));
  }, [variants]);

  const [selected, setSelected] = useState<VariantTypeDb>(() => (available[0] ?? "normal"));

  // keep selection valid if available list changes
  useEffect(() => {
    if (!available.length) return;
    setSelected((prev) => (available.includes(prev) ? prev : available[0]));
  }, [available]);

  if (!variants || available.length === 0) return null;

  const selectedOwned = owned[selected] ?? 0;

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        {available.map((k) => {
          const isSelected = selected === k;
          const qty = owned[k] ?? 0;
          const isOwned = qty > 0;

          return (
            <button
              key={k}
              type="button"
              onClick={() => setSelected(k)}
              className={[
                "rounded-full border px-2 py-1 text-xs transition",
                isSelected
                  ? "border-sky-300/60 bg-sky-500/20 text-sky-100"
                  : isOwned
                    ? "border-emerald-300/40 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/20"
                    : "border-white/15 bg-white/10 text-white/85 hover:bg-white/15",
              ].join(" ")}
              title={isOwned ? `You own ${qty}` : "Not in collection yet"}
              aria-pressed={isSelected}
            >
              {variantLabel(k)}
              {isOwned ? ` • ${qty}` : ""}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {canSave ? (
          <AddToCollectionButton
            game="pokemon"
            cardId={cardId}
            cardName={cardName}
            setName={setName ?? null}
            imageUrl={imageUrl ?? null}
            variantType={selected} // normal | holofoil | reverse_holofoil | first_edition | promo
            initialInCollection={selectedOwned > 0}
            initialQuantity={selectedOwned}
            className={
              selectedOwned > 0
                ? "rounded-md border border-emerald-400/50 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-50 hover:bg-emerald-500/25 disabled:opacity-60"
                : "rounded-md border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 disabled:opacity-60"
            }
          />
        ) : (
          <div className="text-xs text-white/60">Sign in to add variants to your collection.</div>
        )}

        <div className="text-xs text-white/60">
          Selected: <span className="text-white/85">{variantLabel(selected)}</span>
        </div>
      </div>
    </div>
  );
}
