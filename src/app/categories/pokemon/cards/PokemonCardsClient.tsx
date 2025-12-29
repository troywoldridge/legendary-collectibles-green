// src/app/categories/pokemon/cards/PokemonCardsClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";

import AddToCollectionButton from "@/components/collection/AddToCollectionButton";
import VariantChips, {
  type PokemonVariants,
  type VariantKey,
  VARIANT_DB,
} from "@/components/pokemon/VariantChips";

type Card = {
  cardId: string;
  name: string;
  setName: string | null;
  imageUrl: string | null;
  variants?: PokemonVariants;
};

type ContainsMap = Record<
  string,
  {
    inCollection: boolean;
    quantity: number;
    variants?: Record<string, number>; // DB variant_type -> qty
  }
>;

/** Strict boolean interpretation (prevents !!"f" === true disasters) */
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

function availableVariantKeys(variants: PokemonVariants): VariantKey[] {
  if (!variants) return [];
  const keys: VariantKey[] = [];
  if (truthy(variants.normal)) keys.push("normal");
  if (truthy(variants.holo)) keys.push("holo");
  if (truthy(variants.reverse)) keys.push("reverse");
  if (truthy(variants.first_edition)) keys.push("first_edition");
  if (truthy(variants.w_promo)) keys.push("w_promo");
  return keys;
}

/**
 * Convert DB variant_type counts -> VariantKey counts.
 * DB keys from /api/collection/contains:
 *  - normal
 *  - holofoil
 *  - reverse_holofoil
 *  - first_edition
 *  - promo
 */
function ownedCountsFromDb(raw?: Record<string, number>): Partial<Record<VariantKey, number>> {
  const out: Partial<Record<VariantKey, number>> = {};
  if (!raw) return out;

  for (const [kRaw, qtyRaw] of Object.entries(raw)) {
    const k = String(kRaw ?? "").trim().toLowerCase();
    const qty = Number(qtyRaw) || 0;
    if (!qty) continue;

    if (k === "normal") out.normal = (out.normal ?? 0) + qty;
    else if (k === "holofoil" || k === "holo") out.holo = (out.holo ?? 0) + qty;
    else if (k === "reverse_holofoil" || k === "reverse") out.reverse = (out.reverse ?? 0) + qty;
    else if (k === "first_edition") out.first_edition = (out.first_edition ?? 0) + qty;
    else if (k === "promo" || k === "w_promo" || k === "wpromo")
      out.w_promo = (out.w_promo ?? 0) + qty;
  }

  return out;
}

function defaultSelected(available: VariantKey[]): VariantKey | null {
  return available.length ? available[0] : null;
}

function TileVariantControls({
  variants,
  ownedDbCounts,
  cardId,
  cardName,
  setName,
  imageUrl,
}: {
  variants: PokemonVariants;
  ownedDbCounts?: Record<string, number>;
  cardId: string;
  cardName: string;
  setName: string | null;
  imageUrl: string | null;
}) {
  const available = useMemo(() => availableVariantKeys(variants), [variants]);
  const ownedCounts = useMemo(() => ownedCountsFromDb(ownedDbCounts), [ownedDbCounts]);

  const [selected, setSelected] = useState<VariantKey | null>(() => defaultSelected(available));

  useEffect(() => {
    if (!available.length) {
      setSelected(null);
      return;
    }
    setSelected((prev) => (prev && available.includes(prev) ? prev : available[0]));
  }, [available]);

  if (!variants || !selected || available.length === 0) return null;

  // canonical DB variant_type value to store in user_collection_items.variant_type
  const selectedDbVariantType = VARIANT_DB[selected]; // normal | holofoil | reverse_holofoil | first_edition | promo
  const selectedOwned = ownedCounts[selected] ?? 0;

  return (
    <div className="space-y-2">
      <VariantChips
        variants={variants}
        selected={selected}
        onSelect={setSelected}
        ownedCounts={ownedCounts}
      />

      <AddToCollectionButton
        game="pokemon"
        cardId={cardId}
        cardName={cardName}
        setName={setName}
        imageUrl={imageUrl}
        variantType={selectedDbVariantType}
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

export default function PokemonCardsClient({ cards }: { cards: Card[] }) {
  const [statusMap, setStatusMap] = useState<ContainsMap>({});

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
            <Link className="group block" href={`${basePath}/${encodeURIComponent(c.cardId)}`}>
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
                  <div className="absolute inset-0 grid place-items-center text-white/60">No image</div>
                )}

                {inCol ? (
                  <div className="absolute left-2 top-2 rounded-full border border-emerald-300/30 bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-200 backdrop-blur-sm">
                    In collection{qty > 0 ? ` • ${qty}` : ""}
                  </div>
                ) : null}
              </div>

              <div className="p-3 pb-2">
                <div className="line-clamp-2 text-sm font-medium text-white">{c.name}</div>
                <div className="mt-1 line-clamp-1 text-xs text-white/70">
                  {c.cardId}
                  {c.setName ? ` • ${c.setName}` : ""}
                </div>
              </div>
            </Link>

            <div className="px-3 pb-3">
              <TileVariantControls
                variants={c.variants ?? null}
                ownedDbCounts={st?.variants}
                cardId={c.cardId}
                cardName={c.name}
                setName={c.setName}
                imageUrl={c.imageUrl}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
