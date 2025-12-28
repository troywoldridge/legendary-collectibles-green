// src/app/categories/pokemon/cards/PokemonCardsClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import AddToCollectionButton from "@/components/collection/AddToCollectionButton";

type Card = {
  cardId: string;
  name: string;
  setName: string | null;
  imageUrl: string | null;
};

export default function PokemonCardsClient({ cards }: { cards: Card[] }) {
  const [statusMap, setStatusMap] = useState<
    Record<string, { inCollection: boolean; quantity: number }>
  >({});

  const ids = useMemo(() => cards.map((c) => c.cardId), [cards]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const res = await fetch("/api/collection/contains", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ game: "pokemon", cardIds: ids }),
        });
        if (!res.ok) return;

        const json = await res.json();
        if (!cancelled && json?.map) setStatusMap(json.map);
      } catch {
        // ignore
      }
    }

    if (ids.length) run();
    return () => {
      cancelled = true;
    };
  }, [ids]);

  const basePath = "/categories/pokemon/cards";

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
      {cards.map((c) => {
        const st = statusMap[c.cardId];
        const inCol = st?.inCollection ?? false;
        const qty = st?.quantity ?? 0;

        return (
          <li
            key={c.cardId}
            className="rounded-xl border border-white/10 bg-white/5 transition hover:border-white/20 hover:bg-white/10"
          >
            <div className="group block">
              {/* Clickable image/title area */}
              <Link href={`${basePath}/${encodeURIComponent(c.cardId)}`}>
                <div className="relative mx-auto w-full" style={{ aspectRatio: "3 / 4" }}>
                  {c.imageUrl ? (
                    <Image
                      src={c.imageUrl}
                      alt={c.name}
                      fill
                      sizes="(max-width: 768px) 50vw, (max-width: 1280px) 25vw, 16vw"
                      className="object-contain transition-transform group-hover:scale-[1.02]"
                      unoptimized
                    />
                  ) : (
                    <div className="absolute inset-0 grid place-items-center text-white/60">
                      No image
                    </div>
                  )}

                  {/* In-collection badge */}
                  {inCol ? (
                    <div className="absolute left-2 top-2 rounded-full border border-emerald-300/30 bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-200 backdrop-blur-sm">
                      In collection{qty > 0 ? ` • ${qty}` : ""}
                    </div>
                  ) : null}
                </div>

                <div className="p-3 pb-2">
                  <div className="line-clamp-2 text-sm font-medium text-white">
                    {c.name}
                  </div>
                  <div className="mt-1 line-clamp-1 text-xs text-white/70">
                    {c.cardId}
                    {c.setName ? ` • ${c.setName}` : ""}
                  </div>
                </div>
              </Link>

              {/* Action row */}
              <div className="px-3 pb-3 pt-1">
                <AddToCollectionButton
                  game="pokemon"
                  cardId={c.cardId}
                  cardName={c.name}
                  setName={c.setName}
                  imageUrl={c.imageUrl}
                  initialInCollection={inCol}
                  initialQuantity={qty}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
