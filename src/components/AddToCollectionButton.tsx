"use client";

import { useEffect, useMemo, useState } from "react";
import { useUser, SignInButton } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

type Props = {
  // identify the card the user is viewing
  game: "pokemon" | "yugioh" | "mtg" | "sports" | "funko";
  cardId: string;
  // optional snapshots to store
  cardName?: string | null;
  setName?: string | null;
  number?: string | null;
  imageUrl?: string | null;
};

export default function AddToCollectionButton(props: Props) {
  const { isSignedIn } = useUser();
  const [busy, setBusy] = useState(false);
  const [collections, setCollections] = useState<any[]>([]);
  const [collectionId, setCollectionId] = useState<string>("");
  const [qty, setQty] = useState(1);
  const router = useRouter();

  useEffect(() => {
    if (!isSignedIn) return;
    (async () => {
      const res = await fetch("/api/collection");
      if (res.ok) {
        const list = await res.json();
        setCollections(list);
        const def = list.find((c: any) => c.isDefault) || list[0];
        if (def) setCollectionId(def.id);
      }
    })();
  }, [isSignedIn]);

  if (!isSignedIn) {
    return (
      <span className="inline-flex items-center gap-2">
        <SignInButton>
          <button className="px-3 py-2 rounded bg-blue-600 text-white">Sign in to track</button>
        </SignInButton>
      </span>
    );
  }

  async function add() {
    if (!collectionId) {
      alert("Create a collection first.");
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/collection/${collectionId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        game: props.game,
        cardId: props.cardId,
        quantity: qty,
        cardName: props.cardName,
        setName: props.setName,
        number: props.number,
        imageUrl: props.imageUrl,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Failed" }));
      alert(error || "Failed");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={collectionId}
        onChange={(e) => setCollectionId(e.target.value)}
        className="border rounded px-2 py-1"
      >
        {collections.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <input
        type="number" min={1} value={qty}
        onChange={(e) => setQty(Math.max(1, Number(e.target.value || 1)))}
        className="w-16 border rounded px-2 py-1"
      />
      <button
        onClick={add}
        disabled={busy}
        className="px-3 py-2 rounded bg-emerald-600 text-white disabled:opacity-60"
      >
        {busy ? "Adding…" : "Add to collection"}
      </button>
    </div>
  );
}
