"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  game: string;
  cardId: string;
  cardName?: string | null;
  setName?: string | null;
  imageUrl?: string | null;

  /** Variant identity for Pokémon (normal/holo/etc). */
  variantType?: string | null;

  initialInCollection?: boolean;
  initialQuantity?: number;
  className?: string;
};

/**
 * We store canonical values in DB (user_collection_items.variant_type):
 * - normal
 * - holofoil
 * - reverse_holofoil
 * - first_edition
 * - promo
 */
function normalizeVariantType(input: unknown): string {
  const s = String(input ?? "").trim().toLowerCase();
  if (!s) return "normal";

  if (s === "normal") return "normal";
  if (s === "holo" || s === "holofoil") return "holofoil";
  if (
    s === "reverse" ||
    s === "reverse_holo" ||
    s === "reverseholo" ||
    s === "reverse_holofoil"
  )
    return "reverse_holofoil";
  if (s === "first" || s === "firstedition" || s === "first_edition") return "first_edition";
  if (s === "promo" || s === "wpromo" || s === "w_promo") return "promo";

  return "normal";
}

export default function AddToCollectionButton({
  game,
  cardId,
  cardName,
  setName,
  imageUrl,
  variantType = null,
  initialInCollection = false,
  initialQuantity = 0,
  className,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [inCollection, setInCollection] = useState(initialInCollection);
  const [qty, setQty] = useState(initialQuantity);
  const [flash, setFlash] = useState<"added" | "error" | null>(null);

  // If the parent changes (e.g. you switch selected variant),
  // re-sync the local button UI.
  useEffect(() => {
    setInCollection(initialInCollection);
    setQty(initialQuantity);
  }, [initialInCollection, initialQuantity, cardId, variantType]);

  const variantTypeCanon = useMemo(() => normalizeVariantType(variantType), [variantType]);

  async function addOne() {
    if (saving) return;
    setSaving(true);
    setFlash(null);

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
          variantType: variantTypeCanon,
        }),
      });

      if (!res.ok) {
        setFlash("error");
        return;
      }

      setInCollection(true);
      setQty((q) => (q || 0) + 1);
      setFlash("added");
      setTimeout(() => setFlash(null), 1200);
    } catch {
      setFlash("error");
    } finally {
      setSaving(false);
    }
  }

  if (inCollection) {
    return (
      <button
        type="button"
        onClick={addOne}
        disabled={saving}
        className={
          className ??
          "rounded-md border border-emerald-400/50 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-50 hover:bg-emerald-500/25 disabled:opacity-60"
        }
        title="Add another copy"
      >
        {saving ? "Saving…" : `✅ In Collection${qty ? ` (${qty})` : ""}  +1`}
        {flash === "error" ? " — error" : ""}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={addOne}
      disabled={saving}
      className={
        className ??
        "rounded-md border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 disabled:opacity-60"
      }
    >
      {saving ? "Adding…" : flash === "added" ? "✅ Added" : "➕ Add to collection"}
      {flash === "error" ? " — error" : ""}
    </button>
  );
}
