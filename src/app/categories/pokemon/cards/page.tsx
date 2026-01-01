// src/app/categories/pokemon/cards/page.tsx
import "server-only";

import Link from "next/link";
import Script from "next/script";
import type { Metadata } from "next";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import PokemonCardsClient from "./PokemonCardsClient";
import { site } from "@/config/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ---------------- types ---------------- */
type CardListRow = {
  id: string;
  name: string | null;
  rarity: string | null;
  set_name: string | null;
  set_id: string | null;
  number: string | null;
  small_image: string | null;
  large_image: string | null;

  v_normal: boolean | null;
  v_reverse: boolean | null;
  v_holo: boolean | null;
  v_first_edition: boolean | null;
  v_w_promo: boolean | null;
};

type SearchParams = {
  q?: string;
  page?: string;
  perPage?: string;
  lang?: string;
};

/* ---------------- helpers ---------------- */
const PER_PAGE_OPTIONS = [30, 60, 120, 240] as const;
const LANG_OPTIONS = ["en", "ja"] as const;
type LangOpt = (typeof LANG_OPTIONS)[number];

function absBase() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
    site?.url ||
    "https://legendary-collectibles.com"
  );
}

function absUrl(path: string) {
  const base = absBase().replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function parsePerPage(v?: string): number {
  const n = Number(v ?? 30);
  return (PER_PAGE_OPTIONS as readonly number[]).includes(n) ? n : 30;
}

function parsePage(v?: string): number {
  const n = Number(v ?? 1);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

function parseLang(v?: string): LangOpt {
  const s = (v ?? "en").trim().toLowerCase();
  return (LANG_OPTIONS as readonly string[]).includes(s) ? (s as LangOpt) : "en";
}

function buildHref(
  base: string,
  qs: { q?: string | null; page?: number; perPage?: number; lang?: LangOpt },
) {
  const p = new URLSearchParams();
  if (qs.q) p.set("q", qs.q);
  if (qs.perPage) p.set("perPage", String(qs.perPage));
  if (qs.page) p.set("page", String(qs.page));
  if (qs.lang) p.set("lang", qs.lang);
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

/** Normalize variants to strict booleans so client chip logic is deterministic */
function normalizeVariants(
  row: Pick<CardListRow, "v_normal" | "v_reverse" | "v_holo" | "v_first_edition" | "v_w_promo">,
) {
  return {
    normal: row.v_normal === true,
    reverse: row.v_reverse === true,
    holo: row.v_holo === true,
    first_edition: row.v_first_edition === true,
    w_promo: row.v_w_promo === true,
  };
}

function tcgdexImageUrl(base?: string | null, quality: "low" | "high" = "high") {
  if (!base) return null;

  if (base.startsWith("https://assets.tcgdex.net/")) {
    if (/\.(webp|png|jpg)$/.test(base)) return base;
    if (/\/(low|high)\.(webp|png|jpg)$/.test(base)) return base;
    return `${base}/${quality}.webp`;
  }

  return base;
}

/* ---------------- SEO metadata (dynamic) ---------------- */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const sp = await searchParams;

  const q = (sp?.q ?? "").trim();
  const lang = parseLang(sp?.lang);
  const page = parsePage(sp?.page);

  const basePath = "/categories/pokemon/cards";
  const canonical = absUrl(basePath);

  const titleBase =
    lang === "ja"
      ? "Japanese Pokémon Cards"
      : "Pokémon Cards";

  const title =
    q
      ? `${titleBase} matching “${q}” | ${site.name}`
      : page > 1
        ? `${titleBase} (Page ${page}) | ${site.name}`
        : `${titleBase} | ${site.name}`;

  const description =
    lang === "ja"
      ? "Browse authentic Japanese Pokémon cards including modern sets, vintage releases, and promo cards. Track prices, manage your collection, and discover rare Japanese exclusives."
      : "Browse Pokémon cards across modern and classic sets. Track prices, view variants, and manage your personal collection on Legendary Collectibles.";

  const og = site?.ogImage ? (site.ogImage.startsWith("http") ? site.ogImage : absUrl(site.ogImage)) : absUrl("/og-image.png");

  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      url: canonical,
      siteName: site.name,
      title,
      description,
      images: [{ url: og }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [og],
    },
  };
}

export default async function PokemonCardsIndex({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const baseHref = "/categories/pokemon/cards";

  const q: string | null = (sp?.q ?? "").trim() || null;
  const perPage: number = parsePerPage(sp?.perPage);
  const reqPage: number = parsePage(sp?.page);
  const lang: LangOpt = parseLang(sp?.lang);

  // For Japanese we synced from TCGdex
  const source = lang === "ja" ? "tcgdex" : null;

  const where = sql`
    WHERE c.lang = ${lang}
    ${source ? sql`AND c.source = ${source}` : sql``}
    ${
      q
        ? sql`AND (
            c.name ILIKE ${"%" + q + "%"}
            OR c.rarity ILIKE ${"%" + q + "%"}
            OR c.id ILIKE ${"%" + q + "%"}
            OR c.set_name ILIKE ${"%" + q + "%"}
            OR c.series ILIKE ${"%" + q + "%"}
          )`
        : sql``
    }
  `;

  const total =
    (
      await db.execute<{ count: number }>(sql`
        SELECT COUNT(*)::int AS count
        FROM public.tcg_cards c
        ${where}
      `)
    ).rows?.[0]?.count ?? 0;

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(Math.max(1, reqPage), totalPages);
  const safeOffset = (safePage - 1) * perPage;

  const rows =
    (
      await db.execute<CardListRow>(sql`
        SELECT
          c.id,
          c.name,
          c.rarity,
          c.set_name,
          c.set_id,
          c.number,
          c.small_image,
          c.large_image,

          v.normal        AS v_normal,
          v.reverse       AS v_reverse,
          v.holo          AS v_holo,
          v.first_edition AS v_first_edition,
          v.w_promo       AS v_w_promo

        FROM public.tcg_cards c
        LEFT JOIN public.tcg_card_variants v
          ON v.card_id = c.id

        ${where}
        ORDER BY c.name ASC NULLS LAST, c.id ASC
        LIMIT ${perPage} OFFSET ${safeOffset}
      `)
    ).rows ?? [];

  const from = total === 0 ? 0 : safeOffset + 1;
  const to = Math.min(safeOffset + perPage, total);

  const cards = rows.map((c) => ({
    cardId: c.id,
    name: c.name ?? c.id,
    setName: c.set_name ?? c.set_id ?? null,
    number: c.number ?? null,
    imageUrl:
      lang === "ja"
        ? tcgdexImageUrl(c.large_image || c.small_image, "high")
        : (c.large_image || c.small_image || null),
    variants: normalizeVariants(c),
  }));

  const prevPage = Math.max(1, safePage - 1);
  const nextPage = Math.min(totalPages, safePage + 1);
  const isFirst = safePage <= 1;
  const isLast = safePage >= totalPages;

  // ---------------------------
  // JSON-LD: Breadcrumbs + CollectionPage ItemList
  // ---------------------------
  const canonical = absUrl(baseHref);

  const breadcrumbsJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absUrl("/") },
      { "@type": "ListItem", position: 2, name: "Categories", item: absUrl("/categories") },
      { "@type": "ListItem", position: 3, name: "Pokémon", item: absUrl("/categories/pokemon/sets") },
      {
        "@type": "ListItem",
        position: 4,
        name: lang === "ja" ? "Japanese Pokémon Cards" : "Pokémon Cards",
        item: canonical,
      },
    ],
  };

  const itemList = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: lang === "ja" ? "Japanese Pokémon Cards" : "Pokémon Cards",
    url: canonical,
    description:
      lang === "ja"
        ? "Browse authentic Japanese Pokémon cards including modern sets, vintage releases, and promo cards. Track prices and manage your collection."
        : "Browse Pokémon cards across modern and classic sets. Track prices, explore variants, and manage your collection.",
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: total,
      itemListElement: rows.map((r, idx) => ({
        "@type": "ListItem",
        position: safeOffset + idx + 1,
        name: r.name ?? r.id,
        url: absUrl(`/categories/pokemon/cards/${encodeURIComponent(r.id)}`),
      })),
    },
  };

  return (
    <section className="space-y-6">
      {/* JSON-LD */}
      <Script
        id="pokemon-cards-breadcrumbs-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbsJsonLd) }}
      />
      <Script
        id="pokemon-cards-collectionpage-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }}
      />

      {/* Visible breadcrumbs */}
      <nav className="text-xs text-white/70">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/" className="hover:underline">Home</Link>
          <span className="text-white/40">/</span>
          <Link href="/categories" className="hover:underline">Categories</Link>
          <span className="text-white/40">/</span>
          <Link href="/categories/pokemon/sets" className="hover:underline">Pokémon</Link>
          <span className="text-white/40">/</span>
          <span className="text-white/90">{lang === "ja" ? "Japanese Cards" : "Cards"}</span>
        </div>
      </nav>

      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-white">
          <h1 className="text-2xl font-bold">{lang === "ja" ? "Japanese Pokémon Cards" : "Pokémon Cards"}</h1>
          <div className="text-sm text-white/80">
            Showing {from}-{to} of {total}
            {q ? " (filtered)" : ""} • Language: {lang.toUpperCase()} • Tap a variant chip to add that version
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {/* Language toggle */}
          <div className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 p-1">
            <Link
              href={buildHref(baseHref, { q, perPage, page: 1, lang: "en" })}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                lang === "en" ? "bg-white/15 text-white" : "text-white/70 hover:text-white"
              }`}
            >
              EN
            </Link>
            <Link
              href={buildHref(baseHref, { q, perPage, page: 1, lang: "ja" })}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                lang === "ja" ? "bg-white/15 text-white" : "text-white/70 hover:text-white"
              }`}
            >
              JA
            </Link>
          </div>

          {/* Search */}
          <form action={baseHref} method="get" className="flex items-center gap-2">
            <input type="hidden" name="perPage" value={String(perPage)} />
            <input type="hidden" name="page" value="1" />
            <input type="hidden" name="lang" value={lang} />
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder={lang === "ja" ? "検索… (名前/レア/ID/セット)" : "Search… (name/rarity/id/set)"}
              className="w-60 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white placeholder:text-white/60 outline-none focus:ring-2 focus:ring-white/50 md:w-[340px]"
            />
            <button
              type="submit"
              className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20"
            >
              Search
            </button>

            {q ? (
              <Link
                href={buildHref(baseHref, { perPage, page: 1, lang })}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/15"
              >
                Clear
              </Link>
            ) : null}
          </form>

          {/* Per page */}
          <form action={baseHref} method="get" className="flex items-center gap-2">
            {q ? <input type="hidden" name="q" value={q} /> : null}
            <input type="hidden" name="page" value="1" />
            <input type="hidden" name="lang" value={lang} />
            <label htmlFor="pp" className="sr-only">
              Per page
            </label>
            <select
              id="pp"
              name="perPage"
              defaultValue={String(perPage)}
              className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-white"
            >
              {PER_PAGE_OPTIONS.map((n) => (
                <option key={String(n)} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-md border border-white/20 bg-white/10 px-2.5 py-1 text-white hover:bg-white/20"
            >
              Apply
            </button>
          </form>
        </div>
      </header>

      {/* SEO intro */}
      <div className="max-w-3xl space-y-3 text-sm text-white/80">
        {lang === "ja" ? (
          <>
            <p>
              Browse authentic Japanese Pokémon cards including modern sets, vintage releases, and promo cards. Track prices,
              manage your collection, and discover rare Japanese exclusives.
            </p>
            <p>
              Search by card name, rarity, set, or ID, then explore high-resolution images and variants before adding cards to your collection.
              Japanese cards are popular for print quality, early set releases, and Japan-only promos.
            </p>
          </>
        ) : (
          <>
            <p>
              Browse Pokémon cards across modern and classic sets, from competitive staples to collector favorites. Legendary Collectibles helps
              Pokémon TCG fans discover cards, track market pricing, and manage a personal collection.
            </p>
            <p>
              Use search to find cards by name, rarity, set, or ID, then view images and variants before adding them to your collection.
              New cards and pricing data are added regularly.
            </p>
          </>
        )}
      </div>

      {cards.length === 0 ? (
        <div className="rounded-xl border border-white/15 bg-white/5 p-6 text-white/90 backdrop-blur-sm">
          {q ? "No cards matched your search." : "No cards to display."}
        </div>
      ) : (
        <PokemonCardsClient cards={cards} />
      )}

      {total > perPage ? (
        <nav className="mt-4 flex items-center justify-center gap-2 text-sm">
          <Link
            href={buildHref(baseHref, { q, perPage, lang, page: prevPage })}
            aria-disabled={isFirst}
            className={`rounded-md border px-3 py-1 ${
              isFirst
                ? "pointer-events-none border-white/10 text-white/40"
                : "border-white/20 text-white hover:bg-white/10"
            }`}
          >
            ← Prev
          </Link>

          <span className="px-2 text-white/80">
            Page {safePage} of {totalPages}
          </span>

          <Link
            href={buildHref(baseHref, { q, perPage, lang, page: nextPage })}
            aria-disabled={isLast}
            className={`rounded-md border px-3 py-1 ${
              isLast
                ? "pointer-events-none border-white/10 text-white/40"
                : "border-white/20 text-white hover:bg-white/10"
            }`}
          >
            Next →
          </Link>
        </nav>
      ) : null}
    </section>
  );
}
