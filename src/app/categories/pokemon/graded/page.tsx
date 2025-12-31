// src/app/categories/pokemon/graded/page.tsx
import "server-only";

import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/config/site";

const BASE =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || site.url;

export const metadata: Metadata = {
  title: "PSA Graded Pokémon Cards | Legendary Collectibles",
  description:
    "Explore PSA graded Pokémon cards and high-end grails. Track graded value trends, manage your collection, and discover top cards ranked by PriceCharting.",
  alternates: {
    canonical: `${BASE}/categories/pokemon/graded`,
  },
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function PokemonGradedLanding() {
  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-extrabold text-white">
          PSA Graded Pokémon Cards
        </h1>
        <p className="text-white/80">
          Graded Pokémon cards are where condition meets collectibility. PSA
          graded cards are especially popular for long-term collectors chasing
          pristine copies, vintage holos, and modern chase cards in gem-mint
          condition.
        </p>
        <p className="text-white/80">
          Legendary Collectibles helps you research graded value, track prices,
          and build a collection you can actually measure. If you’re hunting
          grails, start with our graded rankings and then drill into sets and
          individual card pages.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/categories/pokemon/top-pricecharting"
          className="rounded-xl border border-white/15 bg-white/5 p-4 text-white hover:bg-white/10"
        >
          <div className="text-sm font-semibold">Top graded cards</div>
          <div className="mt-1 text-xs text-white/70">
            Ranked by graded PriceCharting value (great grail list).
          </div>
        </Link>

        <Link
          href="/categories/pokemon/cards"
          className="rounded-xl border border-white/15 bg-white/5 p-4 text-white hover:bg-white/10"
        >
          <div className="text-sm font-semibold">Browse Pokémon cards</div>
          <div className="mt-1 text-xs text-white/70">
            Use card pages to research printings and price context.
          </div>
        </Link>

        <Link
          href="/search?q=PSA%20pokemon"
          className="rounded-xl border border-white/15 bg-white/5 p-4 text-white hover:bg-white/10"
        >
          <div className="text-sm font-semibold">Search “PSA Pokémon”</div>
          <div className="mt-1 text-xs text-white/70">
            Quick entry point while we build true grade filters.
          </div>
        </Link>
      </div>

      <div className="rounded-2xl border border-white/15 bg-white/5 p-5 text-white/80">
        <h2 className="text-lg font-semibold text-white">
          Tips for collecting graded
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          <li>Focus on iconic cards first (base-era holos, starters, legends)</li>
          <li>Compare graded vs raw price spreads before buying</li>
          <li>Use population reports + recent sales when available</li>
        </ul>
      </div>

      <div className="text-sm text-white/70">
        Want the broad view? Head back to{" "}
        <Link href="/categories/pokemon/sets" className="text-sky-300 hover:underline">
          Pokémon sets
        </Link>{" "}
        or{" "}
        <Link href="/categories" className="text-sky-300 hover:underline">
          all categories
        </Link>
        .
      </div>
    </section>
  );
}
