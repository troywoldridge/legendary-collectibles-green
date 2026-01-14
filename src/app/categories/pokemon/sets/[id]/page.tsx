import "server-only";

import Link from "next/link";
import Image from "next/image";
import Script from "next/script";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import PokemonCardsClient from "../../cards/PokemonCardsClient";
import { site } from "@/config/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SetRow = {
  id: string;
  name: string | null;
  series: string | null;
  ptcgo_code: string | null;
  release_date: string | null;
  logo_url: string | null;
  symbol_url: string | null;
};

type CardListRow = {
  id: string;
  name: string | null;
  rarity: string | null;
  number: string | null;

  small_image: string | null;
  large_image: string | null;

  v_normal: boolean | null;
  v_reverse: boolean | null;
  v_holo: boolean | null;
  v_first_edition: boolean | null;
  v_w_promo: boolean | null;
};

type SearchParams = Record<string, string | string[] | undefined>;

const PER_PAGE_OPTIONS = [30, 60, 120, 240] as const;
const DEFAULT_PP = 30;

/* ---------------- URL helpers ---------------- */
function absBase() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
    process.env.SITE_URL?.replace(/\/+$/, "") ||
    site?.url?.replace(/\/+$/, "") ||
    "https://legendary-collectibles.com"
  );
}

function absUrl(path: string) {
  const base = absBase().replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function absMaybe(urlOrPath: string | null | undefined) {
  if (!urlOrPath) return absUrl(site.ogImage || "/og-image.png");
  const s = String(urlOrPath).trim();
  if (!s) return absUrl(site.ogImage || "/og-image.png");
  if (/^https?:\/\//i.test(s)) return s;
  return absUrl(s);
}

function first(v?: string | string[]) {
  return Array.isArray(v) ? v[0] : v;
}

function readQ(sp: SearchParams) {
  const q = (first(sp?.q) ?? "").trim();
  return q ? q : null;
}

function readPage(sp: SearchParams) {
  // supports ?page= and ?p=
  const raw = first(sp?.page) ?? first(sp?.p);
  const n = Number(raw ?? 1);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

function readPerPage(sp: SearchParams) {
  // supports ?perPage= and ?pp=
  const raw = first(sp?.perPage) ?? first(sp?.pp);
  const n = Number(raw ?? DEFAULT_PP);
  return (PER_PAGE_OPTIONS as readonly number[]).includes(n) ? n : DEFAULT_PP;
}

function parseBool(v?: string | string[]) {
  const s = (first(v) ?? "").toLowerCase();
  return s === "1" || s === "true" || s === "on" || s === "yes";
}

function isHttpUrl(v?: string | null): v is string {
  if (!v) return false;
  return /^https?:\/\//i.test(v.trim());
}

function pickHttpUrl(a?: string | null, b?: string | null): string | null {
  if (isHttpUrl(a)) return a.trim();
  if (isHttpUrl(b)) return b.trim();
  return null;
}

/**
 * ✅ Canonical-clean query builder:
 * - omits page when 1
 * - omits perPage when DEFAULT_PP
 * - omits flags when false
 * - omits q when empty
 */
function buildCanonicalQuery(qs: {
  q?: string | null;
  page?: number;
  perPage?: number;
  rares?: boolean;
  holo?: boolean;
}) {
  const p = new URLSearchParams();

  if (qs.q) p.set("q", qs.q);

  const page = qs.page ?? 1;
  const perPage = qs.perPage ?? DEFAULT_PP;

  if (page > 1) p.set("page", String(page));
  if (perPage !== DEFAULT_PP) p.set("perPage", String(perPage));

  if (qs.rares) p.set("rares", "1");
  if (qs.holo) p.set("holo", "1");

  const s = p.toString();
  return s ? `?${s}` : "";
}

function canonicalSetAbs(
  baseHref: string,
  qs: { q: string | null; page: number; perPage: number; rares: boolean; holo: boolean }
) {
  return absUrl(`${baseHref}${buildCanonicalQuery(qs)}`);
}

/* ---------------- DB ---------------- */
async function resolvePokemonSet(setParamRaw: string) {
  noStore();

  const safe = decodeURIComponent(setParamRaw ?? "").trim();
  const nameGuess = safe.replace(/-/g, " ").trim();
  const likeGuess = `%${nameGuess}%`;

  let setRow: SetRow | undefined;

  try {
    const res = await db.execute<SetRow>(sql`
      SELECT id, name, series, ptcgo_code, release_date, logo_url, symbol_url
      FROM v_tcg_sets_images
      WHERE id = ${safe}
         OR lower(ptcgo_code) = lower(${safe})
         OR lower(name) = lower(${nameGuess})
         OR name ILIKE ${likeGuess}
      ORDER BY
        CASE
          WHEN id = ${safe} THEN 0
          WHEN lower(ptcgo_code) = lower(${safe}) THEN 1
          WHEN lower(name) = lower(${nameGuess}) THEN 2
          ELSE 3
        END
      LIMIT 1
    `);
    setRow = res.rows?.[0];
  } catch {
    // ignore
  }

  if (!setRow) {
    const res = await db.execute<SetRow>(sql`
      SELECT id, name, series, ptcgo_code, release_date, logo_url, symbol_url
      FROM public.tcg_sets
      WHERE id = ${safe}
         OR lower(ptcgo_code) = lower(${safe})
         OR lower(name) = lower(${nameGuess})
         OR name ILIKE ${likeGuess}
      ORDER BY
        CASE
          WHEN id = ${safe} THEN 0
          WHEN lower(ptcgo_code) = lower(${safe}) THEN 1
          WHEN lower(name) = lower(${nameGuess}) THEN 2
          ELSE 3
        END
      LIMIT 1
    `);
    setRow = res.rows?.[0];
  }

  return { setParam: safe, setRow };
}

/* ---------------- Metadata ---------------- */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const { id } = await params;
  const sp = await searchParams;

  const { setRow, setParam } = await resolvePokemonSet(id);

  const canonicalSetId = encodeURIComponent(setRow?.id ?? setParam);
  const baseHref = `/categories/pokemon/sets/${canonicalSetId}`;

  const q = readQ(sp);
  const perPage = readPerPage(sp);
  const page = Math.max(1, readPage(sp));
  const raresOnly = parseBool(sp?.rares);
  const holoOnly = parseBool(sp?.holo);

  const canonical = canonicalSetAbs(baseHref, {
    q,
    page,
    perPage,
    rares: raresOnly,
    holo: holoOnly,
  });

  const setName = (setRow?.name ?? setParam).trim();
  const series = (setRow?.series ?? "").trim();
  const release = setRow?.release_date ? setRow.release_date.replaceAll("/", "-") : null;

  if (!setName) {
    return {
      title: `Pokémon Sets | ${site.name ?? "Legendary Collectibles"}`,
      description: "Browse Pokémon sets.",
      alternates: { canonical: absUrl("/categories/pokemon/sets") },
      robots: { index: false, follow: true },
    };
  }

  const titleBase = `${setName} • Pokémon Set | ${site.name ?? "Legendary Collectibles"}`;
  const title = page > 1 ? `${titleBase} • Page ${page}` : titleBase;

  const desc = [
    `Browse cards from ${setName}.`,
    series ? `Series: ${series}.` : null,
    release ? `Released: ${release}.` : null,
    raresOnly ? "Filtered: Rares+." : null,
    holoOnly ? "Filtered: Holo only." : null,
    q ? `Search: “${q}”.` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const ogImg =
    pickHttpUrl(setRow?.logo_url, setRow?.symbol_url) ??
    absUrl(site.ogImage || "/og-image.png");

  return {
    title,
    description: desc || `Browse cards from ${setName}.`,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description: desc || `Browse cards from ${setName}.`,
      url: canonical,
      siteName: site.name ?? "Legendary Collectibles",
      type: "website",
      images: ogImg ? [{ url: ogImg }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: desc || `Browse cards from ${setName}.`,
      images: ogImg ? [ogImg] : undefined,
    },
  };
}

/* ---------------- Page ---------------- */
export default async function SetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id: rawId } = await params;
  const sp = await searchParams;

  const { setParam, setRow } = await resolvePokemonSet(rawId ?? "");

  if (!setRow) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold text-white">Set not found</h1>
        <p className="text-sm break-all text-white/70">
          Looked up: <code>{setParam}</code>
        </p>
        <Link href="/categories/pokemon/sets" className="text-sky-300 hover:underline">
          ← Back to all sets
        </Link>
      </section>
    );
  }

  const canonicalSetId = setRow.id;
  const baseHref = `/categories/pokemon/sets/${encodeURIComponent(canonicalSetId)}`;

  const q = readQ(sp);
  const requestedPerPage = readPerPage(sp);
  const requestedPage = readPage(sp);
  const raresOnly = parseBool(sp?.rares);
  const holoOnly = parseBool(sp?.holo);

  // Build WHERE
  const conditions = [sql`c.set_id = ${canonicalSetId}`];

  if (q) {
    conditions.push(sql`(
      c.name ILIKE ${"%" + q + "%"}
      OR c.rarity ILIKE ${"%" + q + "%"}
      OR c.id ILIKE ${"%" + q + "%"}
      OR c.number ILIKE ${"%" + q + "%"}
    )`);
  }

  if (raresOnly && holoOnly) {
    conditions.push(sql`(c.rarity ILIKE '%Rare%' AND (c.rarity ILIKE '%Holo%' OR c.rarity ILIKE '%Foil%'))`);
  } else if (raresOnly) {
    conditions.push(sql`(c.rarity ILIKE '%Rare%')`);
  } else if (holoOnly) {
    conditions.push(sql`(c.rarity ILIKE '%Holo%' OR c.rarity ILIKE '%Foil%')`);
  }

  const whereSql = sql.join(conditions, sql` AND `);

  // Total
  const total =
    (await db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count
      FROM public.tcg_cards c
      WHERE ${whereSql}
    `)).rows?.[0]?.count ?? 0;

  const totalPages = Math.max(1, Math.ceil(total / requestedPerPage));
  const page = Math.max(1, Math.min(totalPages, requestedPage));
  const perPage = requestedPerPage;
  const offset = (page - 1) * perPage;

  // ✅ Redirect to canonical if:
  // - alias params used (?p or ?pp)
  // - default query present (page=1 or perPage=30 etc)
  // - clamped page differs
  const usedAliasParams = sp?.p !== undefined || sp?.pp !== undefined;

  const hasAnyQuery =
    sp?.q !== undefined ||
    sp?.page !== undefined ||
    sp?.perPage !== undefined ||
    sp?.p !== undefined ||
    sp?.pp !== undefined ||
    sp?.rares !== undefined ||
    sp?.holo !== undefined;

  const canonicalRel = `${baseHref}${buildCanonicalQuery({
    q,
    page,
    perPage,
    rares: raresOnly,
    holo: holoOnly,
  })}`;

  const shouldDropDefaultQuery =
    hasAnyQuery &&
    q === null &&
    !raresOnly &&
    !holoOnly &&
    page === 1 &&
    perPage === DEFAULT_PP;

  const needsClampRedirect = page !== requestedPage;

  const explicitDefaultParams =
    (sp?.page !== undefined && page === 1) ||
    (sp?.perPage !== undefined && perPage === DEFAULT_PP);

  if (usedAliasParams || needsClampRedirect || shouldDropDefaultQuery || explicitDefaultParams) {
    redirect(canonicalRel);
  }

  // Rows
  const rows =
    (await db.execute<CardListRow>(sql`
      SELECT
        c.id,
        c.name,
        c.rarity,
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

      WHERE ${whereSql}
      ORDER BY
        CASE WHEN split_part(c.id, '-', 2) ~ '^\\d+$' THEN 0 ELSE 1 END,
        NULLIF(regexp_replace(split_part(c.id, '-', 2), '[^\\d].*$', ''), '')::int NULLS LAST,
        regexp_replace(split_part(c.id, '-', 2), '^\\d+', '') ASC,
        split_part(c.id, '-', 2) ASC,
        c.id ASC
      LIMIT ${perPage} OFFSET ${offset}
    `)).rows ?? [];

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + perPage, total);

  const prevPage = Math.max(1, page - 1);
  const nextPage = Math.min(totalPages, page + 1);
  const isFirst = page <= 1;
  const isLast = page >= totalPages;

  const banner = pickHttpUrl(setRow.logo_url, setRow.symbol_url);

  const subtitle = [
    setRow.series ?? undefined,
    setRow.ptcgo_code ? `PTCGO: ${setRow.ptcgo_code}` : undefined,
    setRow.release_date ? `Released: ${setRow.release_date.replaceAll("/", "-")}` : undefined,
  ]
    .filter(Boolean)
    .join(" • ");

  const cards = rows.map((c) => ({
    cardId: c.id,
    name: c.name ?? c.id,
    setName: setRow.name ?? canonicalSetId,
    imageUrl: c.large_image || c.small_image || null,
    number: c.number ?? null,
    variants: {
      normal: c.v_normal,
      reverse: c.v_reverse,
      holo: c.v_holo,
      first_edition: c.v_first_edition,
      w_promo: c.v_w_promo,
    },
  }));

  // ✅ JSON-LD uses absolute canonical
  const canonicalAbs = canonicalSetAbs(baseHref, {
    q,
    page,
    perPage,
    rares: raresOnly,
    holo: holoOnly,
  });

  const itemsForLd = rows.map((c, i) => ({
    "@type": "ListItem",
    position: offset + i + 1,
    url: absUrl(`/categories/pokemon/cards/${encodeURIComponent(c.id)}`),
    name: c.name ?? c.id,
    image: c.large_image || c.small_image ? absMaybe(c.large_image || c.small_image) : undefined,
  }));

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absUrl("/") },
      { "@type": "ListItem", position: 2, name: "Categories", item: absUrl("/categories") },
      { "@type": "ListItem", position: 3, name: "Pokémon Sets", item: absUrl("/categories/pokemon/sets") },
      { "@type": "ListItem", position: 4, name: setRow.name ?? canonicalSetId, item: canonicalAbs },
    ],
  };

  const collectionPageId = `${canonicalAbs}#collectionpage`;
  const itemListId = `${canonicalAbs}#itemlist`;

  const collectionLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": collectionPageId,
    name: `${setRow.name ?? canonicalSetId} • Pokémon Set`,
    description: `Browse cards in ${setRow.name ?? canonicalSetId}.`,
    url: canonicalAbs,
    isPartOf: {
      "@type": "WebSite",
      name: site.name ?? "Legendary Collectibles",
      url: absBase(),
    },
    ...(banner ? { image: absMaybe(banner) } : {}),
    mainEntity: {
      "@type": "ItemList",
      "@id": itemListId,
      numberOfItems: total,
      itemListOrder: "https://schema.org/ItemListOrderAscending",
      itemListElement: itemsForLd,
    },
  };

  return (
    <section className="space-y-6">
      <Script
        id="ld-json-pokemon-set-breadcrumb"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <Script
        id="ld-json-pokemon-set-collection"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionLd) }}
      />

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="relative h-20 w-36 shrink-0 overflow-hidden rounded-lg bg-white/5 ring-1 ring-white/10">
            {banner ? (
              <Image
                src={banner}
                alt={setRow.name ?? setParam}
                fill
                unoptimized
                className="object-contain"
                sizes="144px"
                priority
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center text-xs text-white/60">No image</div>
            )}
          </div>

          <div>
            <h1 className="text-2xl font-bold text-white">{setRow.name ?? setParam}</h1>
            {subtitle && <div className="text-sm text-white/80">{subtitle}</div>}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href={`${baseHref}/prices`}
            className="rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20"
          >
            View price overview →
          </Link>
          <Link href="/categories/pokemon/sets" className="text-sky-300 hover:underline">
            ← All sets
          </Link>
        </div>
      </div>

      {/* Summary */}
      <div className="text-sm text-white/80">
        Showing {from}-{to} of {total} cards
        {(q || raresOnly || holoOnly) && <span> (filtered)</span>}
      </div>

      {cards.length === 0 ? (
        <div className="rounded-xl border border-white/15 bg-white/5 p-6 text-white/90 backdrop-blur-sm">
          {q || raresOnly || holoOnly ? "No cards matched your filters." : "No cards found in this set."}
        </div>
      ) : (
        <PokemonCardsClient cards={cards} />
      )}

      {total > perPage && (
        <nav className="mt-4 flex items-center justify-center gap-2 text-sm">
          <Link
            href={`${baseHref}${buildCanonicalQuery({ q, perPage, rares: raresOnly, holo: holoOnly, page: prevPage })}`}
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
            Page {page} of {totalPages}
          </span>

          <Link
            href={`${baseHref}${buildCanonicalQuery({ q, perPage, rares: raresOnly, holo: holoOnly, page: nextPage })}`}
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
      )}
    </section>
  );
}
