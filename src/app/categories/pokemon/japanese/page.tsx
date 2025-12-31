// src/app/categories/pokemon/japanese/page.tsx
import "server-only";

import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/config/site";

const BASE =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || site.url;

export const metadata: Metadata = {
  title: "Japanese Pokémon Cards | Legendary Collectibles",
  description:
    "Browse authentic Japanese Pokémon cards—modern sets, vintage releases, and promo cards. Track prices, manage your collection, and discover Japanese exclusives.",
  alternates: {
    canonical: `${BASE}/categories/pokemon/japanese`,
  },
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function PokemonJapaneseLanding() {
  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-extrabold text-white">
          Japanese Pokémon Cards
        </h1>
        <p className="text-white/80">
          Explore authentic Japanese Pokémon cards including modern sets, vintage
          releases, and promo cards. Many iconic cards and early set releases
          appear in Japan first, and Japanese exclusives can be some of the most
          collectible pieces in the hobby.
        </p>
        <p className="text-white/80">
          Use Legendary Collectibles to browse sets and card galleries, view
          high-resolution images, and track prices as the market moves. If you
          keep a collection, you can also track what you own and spot gaps you
          still need.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/categories/pokemon/sets"
          className="rounded-xl border border-white/15 bg-white/5 p-4 text-white hover:bg-white/10"
        >
          <div className="text-sm font-semibold">Browse Pokémon sets</div>
          <div className="mt-1 text-xs text-white/70">
            Jump into set pages and browse card galleries.
          </div>
        </Link>

        <Link
          href="/categories/pokemon/cards"
          className="rounded-xl border border-white/15 bg-white/5 p-4 text-white hover:bg-white/10"
        >
          <div className="text-sm font-semibold">All Pokémon cards</div>
          <div className="mt-1 text-xs text-white/70">
            Full card index (English + everything you’ve synced).
          </div>
        </Link>

        <Link
          href="/search?q=japanese%20pokemon"
          className="rounded-xl border border-white/15 bg-white/5 p-4 text-white hover:bg-white/10"
        >
          <div className="text-sm font-semibold">Search “Japanese Pokémon”</div>
          <div className="mt-1 text-xs text-white/70">
            Quick search entry point for Japanese-focused queries.
          </div>
        </Link>
      </div>

      <div className="rounded-2xl border border-white/15 bg-white/5 p-5 text-white/80">
        <h2 className="text-lg font-semibold text-white">
          What you’ll find here
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          <li>Japanese set browsing with clean navigation</li>
          <li>High-quality images for fast identification</li>
          <li>Price tracking and collection tools (when signed in)</li>
        </ul>
      </div>

      <div className="text-sm text-white/70">
        Looking for something specific? Try{" "}
        <Link href="/search" className="text-sky-300 hover:underline">
          searching the vault
        </Link>{" "}
        or start from{" "}
        <Link href="/categories" className="text-sky-300 hover:underline">
          all categories
        </Link>
        .
      </div>
    </section>
  );
}
