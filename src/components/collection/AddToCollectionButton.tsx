"use client";

import { useState } from "react";

type Props = {
  game: string;
  cardId: string;
  cardName?: string | null;
  setName?: string | null;
  imageUrl?: string | null;
  initialInCollection?: boolean;
  initialQuantity?: number;
  className?: string;
};

export default function AddToCollectionButton({
  game,
  cardId,
  cardName,
  setName,
  imageUrl,
  initialInCollection = false,
  initialQuantity = 0,
  className,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [inCollection, setInCollection] = useState(initialInCollection);
  const [qty, setQty] = useState(initialQuantity);
  const [flash, setFlash] = useState<"added" | "error" | null>(null);

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
        }),
      });

      if (!res.ok) {
        setFlash("error");
        return;
      }

      // We don’t rely on response shape; just update UI optimistically.
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
