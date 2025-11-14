// src/app/collection/add/page.tsx
import "server-only";

import Image from "next/image";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import AddCollectionForm from "@/app/collection/add/AddCollectionForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Record<string, string | string[] | undefined>;

function first(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

function safeDecode(v: string | undefined): string {
  if (!v) return "";
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function normalizeGame(raw: string | undefined): string {
  const g = (raw ?? "").toLowerCase();
  if (g === "pokemon") return "pokemon";
  if (g === "mtg" || g === "magic") return "mtg";
  if (g === "ygo" || g === "yugioh" || g === "yu-gi-oh") return "yugioh";
  return "pokemon";
}

export default async function CollectionAddPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const { userId } = await auth();

  if (!userId) {
    return (
      <section className="p-8 text-white">
        <h1 className="text-2xl font-bold">You must sign in</h1>
        <p className="mt-2">
          <Link href="/sign-in" className="underline">
            Sign in
          </Link>{" "}
          to add items to your collection.
        </p>
      </section>
    );
  }

  // Read + normalize query params from the "Add with details" link
  const game = normalizeGame(first(sp, "game"));
  const cardId = first(sp, "cardId") ?? "";
  const cardName = safeDecode(first(sp, "cardName"));
  const setName = safeDecode(first(sp, "setName"));
  const imageUrl = safeDecode(first(sp, "imageUrl"));

  const hasCard = Boolean(cardId || cardName || imageUrl);

  return (
    <section className="mx-auto max-w-3xl space-y-6 p-4 text-white">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Add to Collection</h1>
        <p className="text-sm text-white/70">
          Review the card details and set grading, quantity, and cost before
          saving it to your collection.
        </p>
      </header>

      {/* Card preview if we have any card info */}
      {hasCard && (
        <div className="flex gap-4 rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
          {imageUrl ? (
            <div className="relative h-44 w-32 shrink-0">
              <Image
                src={imageUrl}
                alt={cardName || cardId || "Card image"}
                fill
                unoptimized
                className="rounded-lg object-contain"
                sizes="128px"
              />
            </div>
          ) : (
            <div className="grid h-44 w-32 shrink-0 place-items-center rounded-lg border border-white/20 bg-black/30 text-xs text-white/60">
              No image
            </div>
          )}

          <div className="flex-1 space-y-1">
            <div className="text-xs uppercase tracking-wide text-white/60">
              {game === "pokemon"
                ? "Pokémon"
                : game === "mtg"
                ? "Magic: The Gathering"
                : game === "yugioh"
                ? "Yu-Gi-Oh!"
                : "Game"}
            </div>
            <div className="text-lg font-semibold">
              {cardName || cardId || "Unknown card"}
            </div>
            {setName && (
              <div className="text-sm text-white/70">Set: {setName}</div>
            )}
            {cardId && (
              <div className="text-xs text-white/60">ID: {cardId}</div>
            )}
          </div>
        </div>
      )}

      {/* Details form */}
      <AddCollectionForm
        initial={{
          game,
          cardId,
          cardName: cardName || "",
          setName: setName || "",
          imageUrl: imageUrl || "",
        }}
      />

      <div className="text-sm text-white/60">
        <Link href="/collection" className="text-sky-300 hover:underline">
          ← Back to collection
        </Link>
      </div>
    </section>
  );
}
