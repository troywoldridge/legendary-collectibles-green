// src/components/AddToCollectionMenu.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  game: string;
  cardId: string;
  cardName?: string;
  setName?: string;
  imageUrl?: string;
};

export default function AddToCollectionMenu({
  game,
  cardId,
  cardName,
  setName,
  imageUrl,
}: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function quickAdd() {
    await fetch("/api/collection/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        game,
        cardId,
        cardName,
        setName,
        imageUrl,
        grading_company: "UNGR",
        grade_label: "Ungraded",
        quantity: 1,
      }),
    });

    router.refresh();
    alert("Added to your collection!");
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm"
        type="button"
      >
        Add to Collection
      </button>

      {open && (
        <div className="absolute left-0 mt-1 w-48 rounded-lg bg-white/10 border border-white/20 p-2 backdrop-blur-sm z-50">
          <button
            type="button"
            onClick={quickAdd}
            className="w-full text-left px-2 py-1 rounded hover:bg-white/20 text-white text-sm"
          >
            ➤ 1-Click Add
          </button>

          <button
            type="button"
            onClick={() =>
              router.push(
                `/collection/add?game=${game}&cardId=${cardId}&cardName=${encodeURIComponent(
                  cardName || ""
                )}&setName=${encodeURIComponent(
                  setName || ""
                )}&imageUrl=${encodeURIComponent(imageUrl || "")}`
              )
            }
            className="w-full text-left px-2 py-1 rounded hover:bg-white/20 text-white text-sm"
          >
            ➤ Add With Details
          </button>
        </div>
      )}
    </div>
  );
}
