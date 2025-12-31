// src/app/categories/page.tsx
import "server-only";

import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { site } from "@/config/site";

const BASE =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || site.url;

export const metadata: Metadata = {
  title: "TCG Categories | Pokémon, Yu-Gi-Oh!, MTG | Legendary Collectibles",
  description:
    "Browse trading card game categories at Legendary Collectibles. Explore Pokémon, Yu-Gi-Oh!, and Magic: The Gathering by sets or by individual cards, plus specialty sections like Japanese Pokémon and PSA graded grails.",
  alternates: { canonical: `${BASE}/categories` },
  openGraph: {
    title: "TCG Categories | Legendary Collectibles",
    description:
      "Explore Pokémon, Yu-Gi-Oh!, and MTG. Browse sets, search card galleries, and discover specialty collections like Japanese Pokémon and PSA graded cards.",
    url: `${BASE}/categories`,
    siteName: site.name ?? "Legendary Collectibles",
    type: "website",
  },
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type CatLink = {
  title: string;
  description: string;
  href: string;
  badge?: string;
};

type CatSection = {
  key: string;
  title: string;
  blurb: string;
  links: CatLink[];
};

const SECTIONS: CatSection[] = [
  {
    key: "pokemon",
    title: "Pokémon",
    blurb:
      "Browse Pokémon sets, jump into card galleries, and track collection progress. Explore specialty sections for Japanese releases and graded grails.",
    links: [
      {
        title: "Pokémon Sets",
        description: "Browse all Pokémon TCG sets and open card galleries.",
        href: "/categories/pokemon/sets",
        badge: "Popular",
      },
      {
        title: "Pokémon Cards",
        description: "Browse the Pokémon card index and explore individual cards.",
        href: "/categories/pokemon/cards",
      },
      {
        title: "Japanese Pokémon Cards",
        description: "A landing page focused on Japanese Pokémon releases and exclusives.",
        href: "/categories/pokemon/japanese",
        badge: "SEO",
      },
      {
        title: "PSA Graded Pokémon Cards",
        description: "A landing page for graded collecting and high-end grails.",
        href: "/categories/pokemon/graded",
        badge: "SEO",
      },
      {
        title: "Top Graded (PriceCharting)",
        description: "Ranked list of top Pokémon cards by graded PriceCharting value.",
        href: "/categories/pokemon/top-pricecharting",
        badge: "Grails",
      },
    ],
  },
  {
    key: "yugioh",
    title: "Yu-Gi-Oh!",
    blurb:
      "Explore Yu-Gi-Oh! sets and browse cards inside each set. Sign in to see completion metrics tied to your collection.",
    links: [
      {
        title: "Yu-Gi-Oh! Sets",
        description: "Browse Yu-Gi-Oh! sets and open set card galleries.",
        href: "/categories/yugioh/sets",
      },
      {
        title: "Yu-Gi-Oh! Cards",
        description: "Browse the Yu-Gi-Oh! card index (if enabled on your site).",
        href: "/categories/yugioh/cards",
        badge: "Browse",
      },
    ],
  },
  {
    key: "mtg",
    title: "Magic: The Gathering",
    blurb:
      "Browse Magic sets built from your Scryfall data and jump into card pages with pricing context and collection tools.",
    links: [
      {
        title: "MTG Sets",
        description: "Browse Magic sets and explore card galleries by set code.",
        href: "/categories/mtg/sets",
      },
      {
        title: "MTG Cards",
        description: "Browse the MTG card index (if enabled on your site).",
        href: "/categories/mtg/cards",
        badge: "Browse",
      },
    ],
  },
];

export default function CategoriesPage() {
  // JSON-LD for SEO (CollectionPage + ItemList)
  const itemList = SECTIONS.flatMap((section) =>
    section.links.map((l) => ({
      "@type": "ListItem",
      name: l.title,
      url: `${BASE}${l.href}`,
    })),
  );

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "TCG Categories",
    url: `${BASE}/categories`,
    isPartOf: {
      "@type": "WebSite",
      name: site.name ?? "Legendary Collectibles",
      url: BASE,
    },
    mainEntity: {
      "@type": "ItemList",
      itemListElement: itemList,
    },
  };

  return (
    <section className="space-y-8">
      <Script
        id="categories-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="space-y-3">
        <h1 className="text-3xl font-extrabold text-white">
          Trading Card Game Categories
        </h1>

        <p className="text-white/80">
          Browse Legendary Collectibles by game and quickly jump to sets, card
          galleries, and specialty sections. If you’re researching values, use
          set pages to explore full releases, then open individual cards to view
          images and pricing context.
        </p>

        <p className="text-white/80">
          New here? Start with Pokémon sets, then branch into Japanese Pokémon
          exclusives or PSA graded grails. Yu-Gi-Oh! and Magic: The Gathering
          are also organized by sets so you can find the exact release you’re
          hunting.
        </p>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/categories/pokemon/sets"
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/20"
          >
            Pokémon Sets →
          </Link>
          <Link
            href="/categories/yugioh/sets"
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/20"
          >
            Yu-Gi-Oh! Sets →
          </Link>
          <Link
            href="/categories/mtg/sets"
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/20"
          >
            MTG Sets →
          </Link>
        </div>
      </header>

      <div className="grid gap-4">
        {SECTIONS.map((section) => (
          <div
            key={section.key}
            className="rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-sm"
          >
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white">{section.title}</h2>
              <p className="text-sm text-white/75">{section.blurb}</p>
            </div>

            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {section.links.map((l) => (
                <li
                  key={l.href}
                  className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-white/20 hover:bg-white/10"
                >
                  <Link href={l.href} className="block">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-sm font-semibold text-white">
                        {l.title}
                      </div>
                      {l.badge ? (
                        <span className="rounded-full border border-white/20 bg-black/30 px-2 py-0.5 text-[11px] font-semibold text-white/80">
                          {l.badge}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-white/70">
                      {l.description}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <footer className="text-sm text-white/70">
        Looking for something fast? Try{" "}
        <Link href="/search" className="text-sky-300 hover:underline">
          search
        </Link>{" "}
        or browse{" "}
        <Link href="/store" className="text-sky-300 hover:underline">
          shop listings
        </Link>
        .
      </footer>
    </section>
  );
}
