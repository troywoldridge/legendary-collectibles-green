// src/app/categories/mtg/sets/page.tsx
import "server-only";

import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import Script from "next/script";
import { unstable_noStore as noStore } from "next/cache";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { CF_ACCOUNT_HASH } from "@/lib/cf";
import { site } from "@/config/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ---------------- SEO helpers ---------------- */
function absUrl(path: string) {
  const base = (site?.url ?? "https://legendary-collectibles.com").replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
function absMaybe(urlOrPath: string) {
  if (!urlOrPath) return absUrl("/og-image.png");
  if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath;
  return absUrl(urlOrPath);
}

export const metadata: Metadata = {
  title: `MTG Sets | ${site.name}`,
  description:
    "Browse Magic: The Gathering sets. Open a set to view the card gallery, track pricing, and manage your collection.",
  alternates: { canonical: absUrl("/categories/mtg/sets") },
  openGraph: {
    type: "website",
    url: absUrl("/categories/mtg/sets"),
    title: `MTG Sets | ${site.name}`,
    description:
      "Browse Magic: The Gathering sets by release date. Open any set to view the card gallery and pricing.",
    siteName: site.name,
    images: [{ url: absMaybe(site.ogImage || "/og-image.png") }],
  },
  twitter: {
    card: "summary_large_image",
    title: `MTG Sets | ${site.name}`,
    description:
      "Browse Magic: The Gathering sets by release date. Open any set to view the card gallery and pricing.",
    images: [absMaybe(site.ogImage || "/og-image.png")],
  },
};

/* ---------------- Types ---------------- */
type SearchParams = Record<string, string | string[] | undefined>;

type SetItem = {
  id: string; // set_code (lowercase)
  name: string | null;
  set_type: string | null;
  released_at: string | null; // YYYY-MM-DD
  block: string | null;
  icon_svg_uri: string | null;
  cover_url: string | null;
  card_count: string | null; // text for safety
};

/* ---------------- UI ---------------- */
const CATEGORY = {
  label: "Magic: The Gathering",
  baseHref: "/categories/mtg/sets",
  bannerCfId: "69ab5d2b-407c-4538-3c82-be8a551efa00",
};

const PER_PAGE_OPTIONS = [30, 60, 120, 240] as const;

const cfImageUrl = (id: string, variant = "categoryThumb") =>
  `https://imagedelivery.net/${CF_ACCOUNT_HASH}/${id}/${variant}`;

/* ---------------- Helpers ---------------- */
function lastVal(v?: string | string[]) {
  if (Array.isArray(v)) return v[v.length - 1];
  return v;
}

function parsePerPage(sp: SearchParams) {
  const raw = lastVal(sp?.pp) ?? lastVal(sp?.perPage);
  const n = Number(raw ?? 60);
  return (PER_PAGE_OPTIONS as readonly number[]).includes(n) ? n : 60;
}

function parsePage(sp: SearchParams) {
  const raw = lastVal(sp?.p) ?? lastVal(sp?.page);
  const n = Number(raw ?? 1);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

function buildHref(
  base: string,
  qs: { q?: string | null; p?: number; pp?: number },
) {
  const p = new URLSearchParams();
  if (qs.q) p.set("q", qs.q);
  p.set("p", String(qs.p ?? 1));
  p.set("pp", String(qs.pp ?? 60));
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

/* ---------------- DB ---------------- */
async function getSets(opts: { q: string | null; offset: number; limit: number }) {
  noStore();

  const like = opts.q ? `%${opts.q}%` : null;

  const where = like
    ? sql`(
        COALESCE(ss.name, ds.set_code) ILIKE ${like}
        OR ds.set_code ILIKE ${like}
        OR COALESCE(ss.block, '') ILIKE ${like}
      )`
    : sql`TRUE`;

  const totalRes = await db.execute<{ count: string }>(sql`
    WITH ds AS (
      SELECT
        LOWER(c.set_code) AS set_code,
        COUNT(*)::text AS card_count
      FROM public.scryfall_cards_raw c
      WHERE c.set_code IS NOT NULL AND c.set_code <> ''
      GROUP BY LOWER(c.set_code)
    )
    SELECT COUNT(*)::text AS count
    FROM ds
    LEFT JOIN public.scryfall_sets ss
      ON LOWER(ss.code) = ds.set_code
    WHERE ${where}
  `);

  const total = Number(totalRes.rows?.[0]?.count ?? "0");

  const rowsRes = await db.execute<SetItem>(sql`
    WITH ds AS (
      SELECT
        LOWER(c.set_code) AS set_code,
        COUNT(*)::text AS card_count
      FROM public.scryfall_cards_raw c
      WHERE c.set_code IS NOT NULL AND c.set_code <> ''
      GROUP BY LOWER(c.set_code)
    )
    SELECT
      ds.set_code AS id,
      ss.name,
      ss.set_type,
      COALESCE(TO_CHAR(ss.released_at,'YYYY-MM-DD'), NULL) AS released_at,
      ss.block,
      ss.icon_svg_uri,
      ds.card_count,

      (
        SELECT COALESCE(
          (c.payload->'image_uris'->>'normal'),
          (c.payload->'image_uris'->>'large'),
          (c.payload->'image_uris'->>'small'),
          (c.payload->'card_faces'->0->'image_uris'->>'normal'),
          (c.payload->'card_faces'->0->'image_uris'->>'large'),
          (c.payload->'card_faces'->0->'image_uris'->>'small')
        )
        FROM public.scryfall_cards_raw c
        WHERE LOWER(c.set_code) = ds.set_code
        ORDER BY
          (CASE WHEN c.collector_number ~ '^[0-9]+$' THEN 0 ELSE 1 END),
          c.collector_number::text,
          c.name ASC
        LIMIT 1
      ) AS cover_url

    FROM ds
    LEFT JOIN public.scryfall_sets ss
      ON LOWER(ss.code) = ds.set_code
    WHERE ${where}
    ORDER BY
      ss.released_at DESC NULLS LAST,
      ds.set_code ASC
    LIMIT ${opts.limit} OFFSET ${opts.offset}
  `);

  return { rows: rowsRes.rows ?? [], total };
}

/* ---------------- Page ---------------- */
export default async function MtgSetsIndex({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const baseHref = CATEGORY.baseHref;

  const q = (lastVal(sp?.q) ?? "").trim() || null;
  const perPage = parsePerPage(sp);
  const reqPage = parsePage(sp);

  const { rows, total } = await getSets({
    q,
    offset: (reqPage - 1) * perPage,
    limit: perPage,
  });

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.max(1, Math.min(totalPages, reqPage));
  const offset = (page - 1) * perPage;

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + perPage, total);

  const isFirst = page <= 1;
  const isLast = page >= totalPages;

  const banner = cfImageUrl(CATEGORY.bannerCfId);

  // ---- JSON-LD (SEO) ----
  const itemList = rows.slice(0, 24).map((s, i) => {
    const href = `${CATEGORY.baseHref}/${encodeURIComponent(s.id)}`;
    const img =
      (s.cover_url?.replace(/^http:\/\//, "https://")) ||
      (s.icon_svg_uri?.replace(/^http:\/\//, "https://")) ||
      undefined;

    return {
      "@type": "ListItem",
      position: i + 1,
      url: absUrl(href),
      name: s.name ?? s.id.toUpperCase(),
      ...(img ? { image: img } : {}),
    };
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "MTG Sets",
    description:
      "Browse Magic: The Gathering sets and open a set to view the card gallery and pricing.",
    url: absUrl(CATEGORY.baseHref),
    isPartOf: { "@type": "WebSite", name: site.name ?? "Legendary Collectibles", url: site.url },
    mainEntity: {
      "@type": "ItemList",
      itemListOrder: "https://schema.org/ItemListOrderDescending",
      numberOfItems: total,
      itemListElement: itemList,
    },
  };

  const clearHref = buildHref(baseHref, { p: 1, pp: perPage });

  return (
    <section className="space-y-6">
      <Script
        id="ld-json-mtg-sets"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative h-20 w-36 shrink-0 overflow-hidden rounded-lg bg-white/5 ring-1 ring-white/10">
              <Image
                src={banner}
                alt={CATEGORY.label}
                fill
                unoptimized
                className="object-contain"
                sizes="144px"
                priority
              />
            </div>

            <div>
              <h1 className="text-2xl font-bold text-white">{CATEGORY.label} • Sets</h1>
              <p className="text-sm text-white/80">
                Browse sets by release date. Open any set to view the card gallery.
              </p>
            </div>
          </div>

          <Link href="/categories" className="text-sky-300 hover:underline" prefetch={false}>
            ← All categories
          </Link>
        </div>
      </div>

      {/* Top bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-white/80">
          Showing {from}-{to} of {total.toLocaleString()} sets{q ? " (filtered)" : ""}
        </div>

        <div className="flex flex-wrap gap-3">
          {/* Per page */}
          <form action={baseHref} method="get" className="flex items-center gap-2">
            {q ? <input type="hidden" name="q" value={q} /> : null}
            <input type="hidden" name="p" value="1" />
            <label htmlFor="pp" className="sr-only">
              Per page
            </label>
            <select
              id="pp"
              name="pp"
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
            <input type="hidden" name="pp" value={String(perPage)} />
            <input type="hidden" name="p" value="1" />
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search sets (name/code/block)…"
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
                href={clearHref}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/15"
                prefetch={false}
              >
                Clear
              </Link>
            ) : null}
          </form>
        </div>
      </div>

      {/* Grid */}
      {rows.length === 0 ? (
        <div className="rounded-xl border border-white/15 bg-white/5 p-6 text-white/90 backdrop-blur-sm">
          No sets found.
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {rows.map((s) => {
            const img =
              (s.cover_url?.replace(/^http:\/\//, "https://")) ||
              (s.icon_svg_uri?.replace(/^http:\/\//, "https://")) ||
              banner;

            const href = `${CATEGORY.baseHref}/${encodeURIComponent(s.id)}`;

            return (
              <li
                key={s.id}
                className="overflow-hidden rounded-xl border border-white/10 bg-white/5 transition hover:border-white/20 hover:bg-white/10"
              >
                <Link href={href} className="block" prefetch={false}>
                  <div className="relative w-full" style={{ aspectRatio: "4 / 3" }}>
                    <Image
                      src={img}
                      alt={s.name ?? s.id.toUpperCase()}
                      fill
                      unoptimized
                      className="object-contain"
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                    />
                  </div>

                  <div className="p-3">
                    <div className="line-clamp-2 text-sm font-medium text-white">
                      {s.name ?? s.id.toUpperCase()}
                    </div>

                    <div className="mt-1 text-xs text-white/80">
                      {[s.id.toUpperCase(), s.released_at ?? undefined, s.set_type ?? undefined]
                        .filter(Boolean)
                        .join(" • ")}
                    </div>

                    <div className="mt-0.5 text-[11px] text-white/60 line-clamp-1">
                      {s.block ? s.block : null}
                      {s.card_count ? `${s.block ? " • " : ""}${s.card_count} cards` : null}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* Pager */}
      {total > perPage ? (
        <nav className="mt-4 flex items-center justify-center gap-2 text-sm">
          <Link
            href={buildHref(baseHref, { q, pp: perPage, p: Math.max(1, page - 1) })}
            aria-disabled={isFirst}
            className={`rounded-md border px-3 py-1 ${
              isFirst
                ? "pointer-events-none border-white/10 text-white/40"
                : "border-white/20 text-white hover:bg-white/10"
            }`}
            prefetch={false}
          >
            ← Prev
          </Link>

          <span className="px-2 text-white/80">
            Page {page} of {totalPages}
          </span>

          <Link
            href={buildHref(baseHref, { q, pp: perPage, p: Math.min(totalPages, page + 1) })}
            aria-disabled={isLast}
            className={`rounded-md border px-3 py-1 ${
              isLast
                ? "pointer-events-none border-white/10 text-white/40"
                : "border-white/20 text-white hover:bg-white/10"
            }`}
            prefetch={false}
          >
            Next →
          </Link>
        </nav>
      ) : null}
    </section>
  );
}
