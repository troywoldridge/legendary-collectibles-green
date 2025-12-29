import React from "react";

export type PokemonVariants = {
  normal: boolean | null;
  reverse: boolean | null;
  holo: boolean | null;
  first_edition: boolean | null;
  w_promo: boolean | null;
} | null;

export type VariantKey = "normal" | "holo" | "reverse" | "first_edition" | "w_promo";

// maps UI keys -> stored DB variant_type
export const VARIANT_DB: Record<VariantKey, string> = {
  normal: "normal",
  holo: "holofoil",
  reverse: "reverse_holofoil",
  first_edition: "first_edition",
  w_promo: "promo",
};

const LABELS: Record<VariantKey, string> = {
  normal: "Normal",
  holo: "Holo",
  reverse: "Reverse",
  first_edition: "1st Ed",
  w_promo: "Promo",
};

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

function baseColor(key: VariantKey) {
  switch (key) {
    case "normal":
      return "border-white/15 bg-white/10 text-white/90";
    case "holo":
      return "border-fuchsia-300/25 bg-fuchsia-500/15 text-fuchsia-100";
    case "reverse":
      return "border-sky-300/25 bg-sky-500/15 text-sky-100";
    case "first_edition":
      return "border-amber-300/25 bg-amber-500/15 text-amber-100";
    case "w_promo":
      return "border-emerald-300/25 bg-emerald-500/15 text-emerald-100";
  }
}

export default function VariantChips({
  variants,
  selected,
  onSelect,
  ownedCounts,
}: {
  variants: PokemonVariants;
  selected?: VariantKey | null;
  onSelect?: (v: VariantKey) => void;
  ownedCounts?: Partial<Record<VariantKey, number>>;
}) {
  if (!variants) return null;

  const items: VariantKey[] = [];
  if (truthy(variants.normal)) items.push("normal");
  if (truthy(variants.holo)) items.push("holo");
  if (truthy(variants.reverse)) items.push("reverse");
  if (truthy(variants.first_edition)) items.push("first_edition");
  if (truthy(variants.w_promo)) items.push("w_promo");
  if (items.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {items.map((k) => {
        const clickable = typeof onSelect === "function";
        const isSelected = selected === k;
        const owned = (ownedCounts?.[k] ?? 0) > 0;

        const cls =
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition select-none " +
          baseColor(k) +
          (owned ? " ring-1 ring-white/25" : "") +
          (isSelected ? " ring-2 ring-white/40 border-white/30" : "");

        const content = (
          <>
            <span>{LABELS[k]}</span>
            {owned ? (
              <span className="ml-1 rounded-full border border-white/15 bg-white/10 px-1.5 text-[10px] text-white/90">
                {ownedCounts?.[k] ?? 1}
              </span>
            ) : null}
          </>
        );

        return clickable ? (
          <button
            key={k}
            type="button"
            onClick={() => onSelect(k)}
            className={cls}
            aria-pressed={isSelected}
            title={`Variant: ${LABELS[k]}`}
          >
            {content}
          </button>
        ) : (
          <span key={k} className={cls} title={`Variant: ${LABELS[k]}`}>
            {content}
          </span>
        );
      })}
    </div>
  );
}
