// src/app/categories/pokemon/sets/page.tsx
import "server-only";

import Link from "next/link";
import Image from "next/image";
import Script from "next/script";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";

import type { Metadata } from "next";
import { site } from "@/config/site";

export const metadata: Metadata = {
  title: "Pokémon Sets | Legendary Collectibles",
  description:
    "Browse Pokémon TCG sets by series and release date. Open any set to view cards, pricing, and track collection progress.",
  alternates: {
    canonical: `${site.url}/categories/pokemon/sets`,
  },
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SetRow = {
  id: string;
  name: string | null;
  series: string | null;
  ptcgo_code: string | null;
  release_date: string | null; // TEXT in DB
  logo_url: string | null;
  symbol_url: string | null;

  total_cards: number | null;
  owned_distinct: number | null;
  owned_qty: number | null;
};

type SearchParams = { q?: string; page?: string; perPage?: string };

const PER_PAGE_OPTIONS = [30, 60, 120, 240] as const;

function parsePerPage(v?: string) {
  const n = Number(v ?? 30);
  return (PER_PAGE_OPTIONS as readonly number[]).includes(n) ? n : 30;
}

function parsePage(v?: string) {
  const n = Number(v ?? 1);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

function buildHref(base: string, qs: { q?: string | null; page?: number; perPage?: number }) {
  const p = new URLSearchParams();
  if (qs.q) p.set("q", qs.q);
  if (qs.page) p.set("page", String(qs.page));
  if (qs.perPage) p.set("perPage", String(qs.perPage));
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

/**
 * tcg_sets.release_date is TEXT, often "YYYY/MM/DD" or "YYYY-MM-DD".
 * These expressions let us sort by date without changing schema.
 */
const releaseDateOrderTcgSets = sql`
  CASE
    WHEN release_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN to_date(release_date, 'YYYY-MM-DD')
    WHEN release_date ~ '^[0-9]{4}/[0-9]{2}/[0-9]{2}$' THEN to_date(release_date, 'YYYY/MM/DD')
    ELSE NULL
  END
`;

const releaseDateOrderBaseSets = sql`
  CASE
    WHEN bs.release_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN to_date(bs.release_date, 'YYYY-MM-DD')
    WHEN bs.release_date ~ '^[0-9]{4}/[0-9]{2}/[0-9]{2}$' THEN to_date(bs.release_date, 'YYYY/MM/DD')
    ELSE NULL
  END
`;

function pickHttpUrl(a?: string | null, b?: string | null): string | null {
  const raw = (a && a.trim()) || (b && b.trim()) || "";
  if (!raw) return null;
  return /^https?:\/\//i.test(raw) ? raw : null;
}

function toSetPath(setId: string) {
  return `/categories/pokemon/sets/${encodeURIComponent(setId)}`;
}

function toAbs(urlPath: string) {
  return `${site.url}${urlPath}`;
}

export default async function SetsIndex({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const { userId } = await auth(); // optional; page remains public
  const isLoggedIn = Boolean(userId);

  const q = (sp?.q ?? "").trim() || null;
  const perPage = parsePerPage(sp?.perPage);
  const reqPage = parsePage(sp?.page);
  const page = Math.max(1, reqPage);
  const offset = (page - 1) * perPage;

  const where = q
    ? sql`WHERE (name ILIKE ${"%" + q + "%"} OR series ILIKE ${"%" + q + "%"} OR id ILIKE ${"%" + q + "%"})`
    : sql``;

  const total =
    (await db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count
      FROM tcg_sets
      ${where}
    `)).rows?.[0]?.count ?? 0;

  const sets =
    (
      await db.execute<SetRow>(sql`
        WITH base_sets AS (
          SELECT
            id,
            name,
            series,
            ptcgo_code,
            release_date,
            logo_url,
            symbol_url
          FROM tcg_sets
          ${where}
          ORDER BY ${releaseDateOrderTcgSets} DESC NULLS LAST, name ASC NULLS LAST, id ASC
          LIMIT ${perPage} OFFSET ${offset}
        ),
        card_totals AS (
          SELECT
            set_id,
            COUNT(*)::int AS total_cards
          FROM tcg_cards
          GROUP BY set_id
        ),
        owned AS (
          SELECT
            c.set_id,
            COUNT(DISTINCT uci.card_id)::int AS owned_distinct,
            COALESCE(SUM(uci.quantity), 0)::int AS owned_qty
          FROM user_collection_items uci
          JOIN tcg_cards c ON c.id = uci.card_id
          WHERE uci.user_id = ${userId ?? ""}   -- if logged out, matches nothing
            AND uci.game = 'pokemon'
          GROUP BY c.set_id
        )
        SELECT
          bs.id,
          bs.name,
          bs.series,
          bs.ptcgo_code,
          bs.release_date,
          bs.logo_url,
          bs.symbol_url,
          COALESCE(ct.total_cards, 0)::int AS total_cards,
          COALESCE(o.owned_distinct, 0)::int AS owned_distinct,
          COALESCE(o.owned_qty, 0)::int AS owned_qty
        FROM base_sets bs
        LEFT JOIN card_totals ct ON ct.set_id = bs.id
        LEFT JOIN owned o ON o.set_id = bs.id
        ORDER BY ${releaseDateOrderBaseSets} DESC NULLS LAST, bs.name ASC NULLS LAST, bs.id ASC
      `)
    ).rows ?? [];

  const baseHref = "/categories/pokemon/sets";
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + perPage, total);
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  // ---------- JSON-LD (SEO) ----------
  const itemList = sets.slice(0, 24).map((s, i) => {
    const path = toSetPath(s.id);
    const img = pickHttpUrl(s.logo_url, s.symbol_url);
    return {
      "@type": "ListItem",
      position: i + 1,
      url: toAbs(path),
      name: s.name ?? s.id,
      ...(img ? { image: img } : {}),
    };
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Pokémon Sets",
    description:
      "Browse Pokémon TCG sets. Open any set to view cards, pricing, and collection progress.",
    url: `${site.url}${baseHref}`,
    isPartOf: { "@type": "WebSite", name: site.name ?? "Legendary Collectibles", url: site.url },
    mainEntity: {
      "@type": "ItemList",
      itemListOrder: "https://schema.org/ItemListOrderDescending",
      numberOfItems: total,
      itemListElement: itemList,
    },
  };

  return (
    <section className="space-y-6">
      <Script
        id="ld-json-pokemon-sets"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* SEO intro copy (indexable) */}
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-white">Pokémon Sets</h1>
        <p className="text-sm text-white/80">
          Browse sets by release date and series. Open any set to view cards, pricing, and (if you’re
          logged in) track completion.
        </p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-white/80">
          Showing {from}-{to} of {total} sets {q && "(filtered)"}
        </div>

        <div className="flex flex-wrap gap-3">
          {/* Per-page */}
          <form action={baseHref} method="get" className="flex items-center gap-2">
            {q ? <input type="hidden" name="q" value={q} /> : null}
            <input type="hidden" name="page" value="1" />
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
                <option key={n} value={n}>
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

          {/* Search */}
          <form action={baseHref} method="get" className="flex items-center gap-2">
            <input type="hidden" name="perPage" value={String(perPage)} />
            <input type="hidden" name="page" value="1" />
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search sets (name/series/id)…"
              className="w-60 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white placeholder:text-white/60 outline-none focus:ring-2 focus:ring-white/50 md:w-[320px]"
            />
            <button
              type="submit"
              className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20"
            >
              Search
            </button>

            {q ? (
              <Link
                href={buildHref(baseHref, { perPage, page: 1 })}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/15"
              >
                Clear
              </Link>
            ) : null}
          </form>
        </div>
      </div>

      {sets.length === 0 ? (
        <div className="rounded-xl border border-white/15 bg-white/5 p-6 text-white/90 backdrop-blur-sm">
          {q ? "No sets matched your search." : "No sets found."}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {sets.map((s) => {
            const img = pickHttpUrl(s.logo_url, s.symbol_url);

            const totalCards = Number(s.total_cards ?? 0);
            const ownedDistinct = Number(s.owned_distinct ?? 0);
            const ownedCopies = Number(s.owned_qty ?? 0);

            const pct = totalCards > 0 ? Math.round((ownedDistinct / totalCards) * 100) : 0;

            return (
              <li
                key={s.id}
                className="overflow-hidden rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition hover:border-white/20 hover:bg-white/10"
              >
                <Link href={toSetPath(s.id)} className="block">
                  <div className="relative aspect-video w-full">
                    {img ? (
                      <Image
                        src={img}
                        alt={s.name ?? s.id}
                        fill
                        unoptimized
                        className="object-contain"
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                      />
                    ) : (
                      <div className="absolute inset-0 grid place-items-center text-white/70">
                        No image
                      </div>
                    )}

                    {isLoggedIn && totalCards > 0 ? (
                      <div className="absolute left-2 top-2 rounded-full border border-white/15 bg-black/40 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
                        {pct}% • {ownedDistinct}/{totalCards}
                      </div>
                    ) : null}
                  </div>

                  <div className="p-3">
                    <div className="line-clamp-2 text-sm font-semibold text-white">
                      {s.name ?? s.id}
                    </div>

                    <div className="mt-1 text-xs text-white/80">
                      {(s.series ?? "").trim()}
                      {s.series && s.ptcgo_code ? " • " : ""}
                      {s.ptcgo_code ?? ""}
                    </div>

                    {s.release_date ? (
                      <div className="mt-0.5 text-[11px] text-white/70">
                        Released: {s.release_date.replaceAll("/", "-")}
                      </div>
                    ) : null}

                    {isLoggedIn ? (
                      <div className="mt-3 space-y-1">
                        <div className="flex items-center justify-between text-[11px] text-white/70">
                          <span>
                            {ownedDistinct.toLocaleString()} / {totalCards.toLocaleString()} cards
                          </span>
                          <span className="text-white/80">
                            {totalCards > 0 ? `${pct}%` : "—"}
                          </span>
                        </div>

                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-white/70"
                            style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                          />
                        </div>

                        {ownedCopies > 0 ? (
                          <div className="text-[11px] text-white/60">
                            {ownedCopies.toLocaleString()} total copies
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </Link>

                {isLoggedIn ? (
                  <div className="px-3 pb-3 pt-0">
                    <Link
                      href={`/collection?game=pokemon&set=${encodeURIComponent(s.id)}`}
                      className="text-[11px] text-sky-300 hover:underline"
                    >
                      View in my collection →
                    </Link>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {total > perPage ? (
        <nav className="mt-4 flex items-center justify-center gap-2 text-sm">
          <Link
            href={buildHref(baseHref, { q, perPage, page: Math.max(1, page - 1) })}
            aria-disabled={page === 1}
            className={`rounded-md border px-3 py-1 ${
              page === 1
                ? "pointer-events-none border-white/10 text-white/40"
                : "border-white/20 text-white hover:bg-white/10"
            }`}
          >
            ← Prev
          </Link>

          <span className="px-2 text-white/80">
            Page {page} of {Math.max(1, Math.ceil(total / perPage))}
          </span>

          <Link
            href={buildHref(baseHref, { q, perPage, page: page + 1 })}
            aria-disabled={offset + perPage >= total}
            className={`rounded-md border px-3 py-1 ${
              offset + perPage >= total
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
