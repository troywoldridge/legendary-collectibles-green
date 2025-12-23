"use client";

import Link from "next/link";

type CardLike = {
  id: string;
  name: string;
  number?: string | null;
  set_code?: string | null;
  set_name?: string | null;
};

type Props = {
  card: CardLike;
  /** Display name, e.g. "Pokémon TCG", "Magic: The Gathering", "Yu-Gi-Oh!" */
  game?: string | null;

  /** Optional UI variant */
  variant?: "pill" | "card";
};

/**
 * eBay CTA that does NOT depend on "@/lib/ebay".
 * This prevents build breaks when the server-side ebay module changes.
 */
export default function CardEbayCTA({
  card,
  game,
  variant = "pill",
}: Props) {
  const q = buildQuery(card, game);
  const href = ebaySearchLink(q);

  if (variant === "card") {
    return (
      <div className="rounded-xl border border-sky-400/30 bg-sky-400/5 p-4 shadow-lg shadow-sky-500/10">
        <div className="text-xs uppercase tracking-wide text-sky-200/80">
          eBay
        </div>
        <div className="mt-1 text-sm text-white/90">
          Search for <span className="font-semibold">{card.name}</span> on eBay.
        </div>
        <div className="mt-3">
          <Link
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-sky-400 px-4 py-2 text-sm font-semibold text-black hover:bg-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
          >
            View on eBay <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </div>
    );
  }

  // pill
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-full border border-sky-300/30 bg-sky-300/10 px-3 py-1.5 text-sm font-semibold text-sky-100 hover:bg-sky-300/15 hover:border-sky-300/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
      title="Search on eBay"
    >
      eBay <span aria-hidden="true">↗</span>
    </Link>
  );
}

/** Builds a good eBay search query for cards */
function buildQuery(card: CardLike, game?: string | null) {
  const bits: string[] = [];

  if (card.name) bits.push(card.name);

  // Prefer set name, fall back to set code
  if (card.set_name) bits.push(card.set_name);
  else if (card.set_code) bits.push(card.set_code);

  // Card number helps a lot for Pokémon/MTG
  if (card.number) bits.push(card.number);

  if (game) bits.push(game);

  // Remove empty, join
  return bits
    .map((s) => String(s).trim())
    .filter(Boolean)
    .join(" ");
}

/**
 * eBay search link builder.
 * Keeps it simple + stable.
 */
function ebaySearchLink(q: string) {
  const query = encodeURIComponent(q);
  // _nkw = keywords
  // _sacat = all categories
  return `https://www.ebay.com/sch/i.html?_nkw=${query}&_sacat=0`;
}
