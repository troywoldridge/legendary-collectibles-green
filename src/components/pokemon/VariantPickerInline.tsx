// src/components/pokemon/VariantPickerInline.tsx
"use client";

import { useMemo, useState } from "react";
import AddToCollectionButton from "@/components/collection/AddToCollectionButton";

type PokemonVariants =
  | {
      normal: boolean | null;
      reverse: boolean | null;
      holo: boolean | null;
      first_edition: boolean | null;
      w_promo: boolean | null;
    }
  | null;

type VariantKey = "normal" | "holofoil" | "reverse_holofoil" | "first_edition" | "promo";

function variantLabel(v: VariantKey) {
  switch (v) {
    case "holofoil":
      return "Holo";
    case "reverse_holofoil":
      return "Reverse";
    case "first_edition":
      return "1st";
    case "promo":
      return "Promo";
    default:
      return "Normal";
  }
}

function variantEnabled(v: VariantKey, variants: PokemonVariants) {
  if (!variants) return false;
  if (v === "normal") return !!variants.normal;
  if (v === "holofoil") return !!variants.holo;
  if (v === "reverse_holofoil") return !!variants.reverse;
  if (v === "first_edition") return !!variants.first_edition;
  if (v === "promo") return !!variants.w_promo;
  return false;
}

export default function VariantPickerInline({
  variants,
  ownedCounts,
  cardId,
  cardName,
  setName,
  imageUrl,
}: {
  variants: PokemonVariants;
  ownedCounts?: Record<string, number>;
  cardId: string;
  cardName: string;
  setName?: string | null;
  imageUrl?: string | null;
}) {
  const keys: VariantKey[] = ["normal", "holofoil", "reverse_holofoil", "first_edition", "promo"];

  const available = useMemo(() => keys.filter((k) => variantEnabled(k, variants)), [variants]);

  if (!variants || available.length === 0) {
    // fallback: allow “normal” add if you want, or render nothing.
    return null;
  }

  const defaultVariant: VariantKey = (available[0] ?? "normal") as VariantKey;
  const [selected, setSelected] = useState<VariantKey>(defaultVariant);

  const selectedOwned = ownedCounts?.[selected] ?? 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {available.map((k) => {
          const isSelected = selected === k;
          const owned = ownedCounts?.[k] ?? 0;
          const isOwned = owned > 0;

          return (
            <button
              key={k}
              type="button"
              onClick={() => setSelected(k)}
              className={[
                "rounded-full border px-2 py-0.5 text-[11px] transition",
                isSelected
                  ? "border-sky-300/60 bg-sky-500/20 text-sky-100"
                  : isOwned
                    ? "border-emerald-300/40 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/20"
                    : "border-white/15 bg-white/10 text-white/85 hover:bg-white/15",
              ].join(" ")}
              title={isOwned ? `You own ${owned}` : "Not in collection yet"}
            >
              {variantLabel(k)}
              {isOwned ? `•${owned}` : ""}
            </button>
          );
        })}
      </div>

      <AddToCollectionButton
        game="pokemon"
        cardId={cardId}
        cardName={cardName}
        setName={setName ?? null}
        imageUrl={imageUrl ?? null}
        variantType={selected}
        initialInCollection={selectedOwned > 0}
        initialQuantity={selectedOwned}
        className={
          selectedOwned > 0
            ? "w-full rounded-md border border-emerald-400/50 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-50 hover:bg-emerald-500/25 disabled:opacity-60"
            : "w-full rounded-md border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 disabled:opacity-60"
        }
      />
    </div>
  );
}
