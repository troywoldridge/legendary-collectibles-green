// src/components/AddToWishlistButton.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  game: string;
  cardId: string;
  cardName?: string;
  setName?: string;
  imageUrl?: string;
};

type Status = "idle" | "saving" | "success" | "error";

export default function AddToWishlistButton({
  game,
  cardId,
  cardName,
  setName,
  imageUrl,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function add() {
    try {
      setStatus("saving");
      setErrorMsg(null);

      const res = await fetch("/api/wishlist/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          game,
          cardId,
          cardName,
          setName,
          imageUrl,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      setStatus("success");
      router.refresh();

      // reset status after a short delay
      setTimeout(() => {
        setStatus("idle");
      }, 3000);
    } catch (err) {
      console.error("Failed to add to wishlist", err);
      setStatus("error");
      setErrorMsg("Something went wrong adding to wishlist. Please try again.");
    }
  }

  const isSaving = status === "saving";

  return (
    <div className="inline-flex flex-col">
      <button
        type="button"
        onClick={add}
        disabled={isSaving}
        className="px-3 py-2 rounded bg-purple-600 hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm"
      >
        {isSaving ? "Saving..." : "Add to Wishlist"}
      </button>

      {status === "success" && (
        <span className="mt-1 text-xs text-emerald-300">
          ✓ Added to your wishlist
        </span>
      )}

      {status === "error" && (
        <span className="mt-1 text-xs text-red-300">
          {errorMsg ?? "Could not add to wishlist."}
        </span>
      )}
    </div>
  );
}
