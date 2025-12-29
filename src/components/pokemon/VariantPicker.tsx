"use client";

import { useState } from "react";
import VariantChips, { type PokemonVariants, type VariantKey } from "./VariantChips";

export default function VariantPicker({
  variants,
  onChange,
}: {
  variants: PokemonVariants;
  onChange?: (v: VariantKey) => void;
}) {
  const [selected, setSelected] = useState<VariantKey | null>(defaultVariant(variants));

  if (!variants) return null;

  return (
    <VariantChips
      variants={variants}
      selected={selected}
      onSelect={(v) => {
        setSelected(v);
        onChange?.(v);
      }}
    />
  );
}

function defaultVariant(v: PokemonVariants): VariantKey | null {
  if (!v) return null;
  if (v.holo) return "holo";
  if (v.reverse) return "reverse";
  if (v.normal) return "normal";
  if (v.first_edition) return "first_edition";
  if (v.w_promo) return "w_promo";
  return null;
}

