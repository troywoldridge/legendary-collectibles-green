/* eslint-disable @typescript-eslint/no-unused-vars */
import "server-only";

import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import CardGridTile from "@/components/CardGridTile";
import { site } from "@/config/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Record<string, string | string[] | undefined>;

type SetRow = {
  code: string;
  name: string | null;
  set_type: string | null;
  block: string | null;
  released_at: string | null; // YYYY-MM-DD
};

type CardThumb = {
  id: string;
  name: string | null;
  number: string | null;
  image_url: string | null;
  rarity: string | null;
  price_usd: string | null;
  price_updated: string | null;
};

const PER_PAGE_OPTIONS = [30, 60, 120, 240] as const;

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

function buildHref(base: string, qs: { p?: number; pp?: number }) {
  const p = new URLSearchParams();
  p.set("p", String(qs.p ?? 1));
  p.set("pp", String(qs.pp ?? 60));
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

function httpsify(u?: string | null) {
  if (!u) return null;
  return u.replace(/^http:\/\//i, "https://");
}

/* ---------------- DB ---------------- */
async function getSet(code: string): Promise<SetRow | null> {
  noStore();
  const res = await db.execute<SetRow>(sql`
    SELECT
      code,
      name,
      set_type,
      block,
      COALESCE(TO_CHAR(released_at,'YYYY-MM-DD'), NULL) AS released_at
    FROM public.scryfall_sets
    WHERE LOWER(code) = LOWER(${code})
    LIMIT 1
  `);
  return res.rows?.[0] ?? null;
}

async function getTotalCards(setCode: string): Promise<number> {
  noStore();
  const totalRes = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*)::text AS count
    FROM public.scryfall_cards_raw c
    WHERE LOWER(c.set_code) = LOWER(${setCode})
  `);
  return Number(totalRes.rows?.[0]?.count ?? "0");
}

async function getCardsInSet(opts: {
  setCode: string;
  offset: number;
  limit: number;
}): Promise<CardThumb[]> {
  noStore();

  const res = await db.execute<CardThumb>(sql`
    SELECT
      c.id::text AS id,
      c.name,
      c.collector_number AS number,
      (c.payload->>'rarity') AS rarity,
      COALESCE(
        (c.payload->'image_uris'->>'normal'),
        (c.payload->'image_uris'->>'large'),
        (c.payload->'image_uris'->>'small'),
        (c.payload->'card_faces'->0->'image_uris'->>'normal'),
        (c.payload->'card_faces'->0->'image_uris'->>'large'),
        (c.payload->'card_faces'->0->'image_uris'->>'small')
      ) AS image_url,

      COALESCE(e.effective_usd, sl.usd)::text AS price_usd,
      COALESCE(
        TO_CHAR(e.effective_updated_at, 'YYYY-MM-DD'),
        TO_CHAR(sl.updated_at, 'YYYY-MM-DD')
      ) AS price_updated

    FROM public.scryfall_cards_raw c
    LEFT JOIN public.mtg_prices_effective e
      ON e.scryfall_id = c.id
    LEFT JOIN public.mtg_prices_scryfall_latest sl
      ON sl.scryfall_id = c.id

    WHERE LOWER(c.set_code) = LOWER(${opts.setCode})
    ORDER BY
      (CASE WHEN c.collector_number ~ '^[0-9]+$' THEN 0 ELSE 1 END),
      c.collector_number::text,
      c.name ASC
    LIMIT ${opts.limit} OFFSET ${opts.offset}
  `);

  return res.rows ?? [];
}

/* ---------------- Metadata ---------------- */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const p = await params;
  const sp = await searchParams;

  const id = decodeURIComponent(String(p.id ?? "")).trim();
  if (!id) {
    return { alternates: { canonical: absUrl("/categories/mtg/sets") } };
  }

  const perPage = parsePerPage(sp);
  const page = Math.max(1, parsePage(sp));

  const s = await getSet(id);

  const baseHref = `/categories/mtg/sets/${encodeURIComponent(id)}`;
  const canonical = absUrl(`${baseHref}?p=${page}&pp=${perPage}`);

  if (!s) {
    return {
      title: `MTG Set Not Found | ${site.name}`,
      description: "We couldn’t find that MTG set. Browse sets and try again.",
      alternates: { canonical },
      robots: { index: true, follow: true },
    };
  }

  const titleBase = `${s.name ?? s.code.toUpperCase()} (${s.code.toUpperCase()}) — MTG Set Cards | ${site.name}`;
  const title = page > 1 ? `${titleBase} • Page ${page}` : titleBase;

  const desc = [
    `Browse Magic: The Gathering cards in ${s.name ?? s.code.toUpperCase()}.`,
    s.set_type ? `Type: ${s.set_type}.` : null,
    s.block ? `Block: ${s.block}.` : null,
    s.released_at ? `Released: ${s.released_at}.` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const ogImage = absMaybe(site.ogImage || "/og-image.png");

  return {
    title,
    description: desc,
    alternates: { canonical },
    openGraph: {
      title,
      description: desc,
      url: canonical,
      siteName: site.name,
      type: "website",
      images: [{ url: ogImage }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: desc,
      images: [ogImage],
    },
  };
}

/* ---------------- Page ---------------- */
export default async function MtgSetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id: rawId } = await params;
  const sp = await searchParams;

  const id = decodeURIComponent(String(rawId ?? "")).trim();
  if (!id) notFound();

  const perPage = parsePerPage(sp);
  const reqPage = parsePage(sp);

  const s = await getSet(id);
  if (!s) notFound();

  const total = await getTotalCards(s.code);
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.max(1, Math.min(totalPages, reqPage));
  const offset = (page - 1) * perPage;

  const rows = await getCardsInSet({ setCode: s.code, offset, limit: perPage });

  const baseHref = `/categories/mtg/sets/${encodeURIComponent(s.code)}`;
  const pricesHref = `${baseHref}/prices`;

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + perPage, total);

  // --- JSON-LD: Breadcrumbs + CollectionPage/ItemList ---
  const canonicalUrl = absUrl(`${baseHref}?p=${page}&pp=${perPage}`);
  const listItems = rows.map((c, i) => ({
    "@type": "ListItem",
    position: offset + i + 1,
    url: absUrl(`/categories/mtg/cards/${encodeURIComponent(c.id)}`),
    name: c.name ?? c.id,
    image: httpsify(c.image_url) ?? undefined,
  }));

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absUrl("/") },
      { "@type": "ListItem", position: 2, name: "Categories", item: absUrl("/categories") },
      { "@type": "ListItem", position: 3, name: "MTG Sets", item: absUrl("/categories/mtg/sets") },
      { "@type": "ListItem", position: 4, name: s.name ?? s.code.toUpperCase(), item: canonicalUrl },
    ],
  };

  const collectionLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${s.name ?? s.code.toUpperCase()} (${s.code.toUpperCase()}) — MTG Set Cards`,
    description: `Browse Magic: The Gathering cards in ${s.name ?? s.code.toUpperCase()}.`,
    url: canonicalUrl,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: total,
      itemListOrder: "https://schema.org/ItemListOrderAscending",
      itemListElement: listItems,
    },
  };

  return (
    <section className="space-y-6">
      <Script
        id="ld-json-mtg-set-breadcrumb"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <Script
        id="ld-json-mtg-set-collection"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionLd) }}
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {s.name ?? s.code.toUpperCase()} ({s.code.toUpperCase()})
          </h1>
          <div className="text-sm text-white/70">
            {[
              s.set_type ?? undefined,
              s.block ? `Block: ${s.block}` : undefined,
              s.released_at ? `Released: ${s.released_at}` : undefined,
            ]
              .filter(Boolean)
              .join(" • ")}
          </div>
          <div className="mt-1 text-sm text-white/80">
            {total.toLocaleString()} cards
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link href={pricesHref} className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20" prefetch={false}>
            View set price averages →
          </Link>
          <Link href="/categories/mtg/sets" className="text-sky-300 hover:underline" prefetch={false}>
            ← All MTG sets
          </Link>
        </div>
      </div>

      {total === 0 ? (
        <div className="rounded-xl border border-white/15 bg-white/5 p-6 text-white/90">
          No cards in this set yet.
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-white/80">
              Showing {from}-{to} of {total.toLocaleString()} cards
            </div>

            {/* Per-page */}
            <form action={baseHref} method="get" className="flex items-center gap-2">
              <input type="hidden" name="p" value="1" />
              <label htmlFor="pp" className="sr-only">Per page</label>
              <select
                id="pp"
                name="pp"
                defaultValue={String(perPage)}
                className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-white"
              >
                {PER_PAGE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}</option>
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

          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {rows.map((c) => {
              const img = httpsify(c.image_url) || null;
              const href = `/categories/mtg/cards/${encodeURIComponent(c.id)}`;

              return (
                <CardGridTile
                  key={c.id}
                  href={href}
                  imageUrl={img}
                  title={c.name ?? c.id}
                  subtitleLeft={[c.rarity ?? "", c.number ?? ""].filter(Boolean).join(" • ") || null}
                  extra={
                    <div className="text-xs text-white/60">
                      {c.price_usd ? `$${c.price_usd}` : "—"}
                      {c.price_updated ? ` • ${c.price_updated}` : ""}
                    </div>
                  }
                  cta={{
                    game: "Magic The Gathering",
                    card: {
                      id: c.id,
                      name: c.name ?? "",
                      number: c.number ?? undefined,
                      set_code: s.code,
                      set_name: s.name ?? undefined,
                    },
                  }}
                />
              );
            })}
          </ul>

          {total > perPage && (
            <nav className="mt-4 flex items-center justify-center gap-2 text-sm">
              <Link
                href={buildHref(baseHref, { pp: perPage, p: Math.max(1, page - 1) })}
                aria-disabled={page === 1}
                className={`rounded-md border px-3 py-1 ${
                  page === 1
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
                href={buildHref(baseHref, { pp: perPage, p: Math.min(totalPages, page + 1) })}
                aria-disabled={page >= totalPages}
                className={`rounded-md border px-3 py-1 ${
                  page >= totalPages
                    ? "pointer-events-none border-white/10 text-white/40"
                    : "border-white/20 text-white hover:bg-white/10"
                }`}
                prefetch={false}
              >
                Next →
              </Link>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
