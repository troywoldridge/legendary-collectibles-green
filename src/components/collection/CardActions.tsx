// src/components/CardActions.tsx
"use client";

import Link from "next/link";
import AddToCollectionMenu from "./AddToCollectionMenu";
import AddToWishlistButton from "./AddToWishlistButton";

type Props = {
  canSave: boolean;
  game: string;
  cardId: string;
  cardName?: string;
  setName?: string;
  imageUrl?: string;
};

export default function CardActions({
  canSave,
  game,
  cardId,
  cardName,
  setName,
  imageUrl,
}: Props) {
  return (
    <div className="relative z-10 rounded-xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm mt-6">
      <h3 className="text-lg font-semibold text-white mb-2">
        Collection & Wishlist
      </h3>

      <div className="flex flex-wrap gap-3 items-center">
        {canSave ? (
          <AddToCollectionMenu
            game={game}
            cardId={cardId}
            cardName={cardName}
            setName={setName}
            imageUrl={imageUrl}
          />
        ) : (
          <Link
            href="/pricing"
            className="px-3 py-2 rounded bg-amber-500 text-white hover:bg-amber-600 inline-flex items-center justify-center text-sm font-medium"
          >
            Sign in or upgrade to save items
          </Link>
        )}

        <AddToWishlistButton
          game={game}
          cardId={cardId}
          cardName={cardName}
          setName={setName}
          imageUrl={imageUrl}
        />
      </div>
    </div>
  );
}
