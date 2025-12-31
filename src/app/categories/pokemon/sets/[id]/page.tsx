// src/app/categories/pokemon/sets/[id]/page.tsx
import "server-only";

import Link from "next/link";
import Image from "next/image";
import Script from "next/script";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import PokemonCardsClient from "../../cards/PokemonCardsClient";
import type { Metadata } from "next";
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

function first(v?: string | string[]) {
  return Array.isArray(v) ? v[0] : v;
}
function parsePerPage(v?: string | string[]) {
  const n = Number(first(v) ?? 30);
  return (PER_PAGE_OPTIONS as readonly number[]).includes(n) ? n : 30;
}
function parsePage(v?: string | string[]) {
  const n = Number(first(v) ?? 1);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
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

function buildQuery(qs: { q?: string | null; page?: number; perPage?: number; rares?: boolean; holo?: boolean }) {
  const p = new URLSearchParams();
  if (qs.q) p.set("q", qs.q);
  if (qs.page && qs.page > 1) p.set("page", String(qs.page));
  if (qs.perPage) p.set("perPage", String(qs.perPage));
  if (qs.rares) p.set("rares", "1");
  if (qs.holo) p.set("holo", "1");
  const s = p.toString();
  return s ? `?${s}` : "";
}

function buildHref(base: string, qs: { q?: string | null; page?: number; perPage?: number; rares?: boolean; holo?: boolean }) {
  return `${base}${buildQuery(qs)}`;
}

async function resolvePokemonSet(setParamRaw: string) {
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

export async function generateMetadata(
  { params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> },
): Promise<Metadata> {
  const { id } = await params;
  const sp = await searchParams;

  const { setRow, setParam } = await resolvePokemonSet(id);

  const q = (first(sp?.q) ?? "").trim() || null;
  const perPage = parsePerPage(sp?.perPage);
  const page = Math.max(1, parsePage(sp?.page));
  const raresOnly = parseBool(sp?.rares);
  const holoOnly = parseBool(sp?.holo);

  const canonicalSetId = encodeURIComponent(setRow?.id ?? setParam);
  const basePath = `/categories/pokemon/sets/${canonicalSetId}`;
  const canonical = `${site.url}${basePath}${buildQuery({ q, page, perPage, rares: raresOnly, holo: holoOnly })}`;

  const setName = (setRow?.name ?? setParam).trim();
  const series = (setRow?.series ?? "").trim();
  const release = setRow?.release_date ? setRow.release_date.replaceAll("/", "-") : null;

  const titleBase = `${setName} • Pokémon Set | Legendary Collectibles`;
  const titleSuffix = page > 1 ? ` • Page ${page}` : "";
  const title = `${titleBase}${titleSuffix}`;

  const desc = [
    `Browse cards from ${setName}.`,
    series ? `Series: ${series}.` : null,
    release ? `Released: ${release}.` : null,
    raresOnly ? "Filtered: Rares+." : null,
    holoOnly ? "Filtered: Holo only." : null,
    q ? `Search: “${q}”.` : null,
  ].filter(Boolean).join(" ");

  const ogImg = pickHttpUrl(setRow?.logo_url, setRow?.symbol_url);

  return {
    title,
    description: desc || `Browse cards from ${setName}.`,
    alternates: { canonical },
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
    },
  };
}

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

  const q = (first(sp?.q) ?? "").trim() || null;
  const perPage = parsePerPage(sp?.perPage);
  const reqPage = parsePage(sp?.page);
  const raresOnly = parseBool(sp?.rares);
  const holoOnly = parseBool(sp?.holo);

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

  const total =
    (await db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count
      FROM public.tcg_cards c
      WHERE ${whereSql}
    `)).rows?.[0]?.count ?? 0;

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(totalPages, Math.max(1, reqPage));
  const safeOffset = (safePage - 1) * perPage;

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
      LIMIT ${perPage} OFFSET ${safeOffset}
    `)).rows ?? [];

  const from = total === 0 ? 0 : safeOffset + 1;
  const to = Math.min(safeOffset + perPage, total);

  const prevPage = Math.max(1, safePage - 1);
  const nextPage = Math.min(totalPages, safePage + 1);
  const isFirst = safePage <= 1;
  const isLast = safePage >= totalPages;

  const banner = pickHttpUrl(setRow.logo_url, setRow.symbol_url);

  const subtitle = [
    setRow.series ?? undefined,
    setRow.ptcgo_code ? `PTCGO: ${setRow.ptcgo_code}` : undefined,
    setRow.release_date ? `Released: ${setRow.release_date.replaceAll("/", "-")}` : undefined,
  ].filter(Boolean).join(" • ");

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

  // ---- JSON-LD (full current page, correct positions) ----
  const canonicalUrl = `${site.url}${baseHref}${buildQuery({ q, page: safePage, perPage, rares: raresOnly, holo: holoOnly })}`;
  const itemsForLd = rows.map((c, i) => ({
    "@type": "ListItem",
    position: safeOffset + i + 1,
    url: `${site.url}/categories/pokemon/cards/${encodeURIComponent(c.id)}`,
    name: c.name ?? c.id,
    image: (c.large_image || c.small_image || undefined) ?? undefined,
  }));

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Categories", item: `${site.url}/categories` },
      { "@type": "ListItem", position: 2, name: "Pokémon", item: `${site.url}/categories/pokemon/sets` },
      { "@type": "ListItem", position: 3, name: setRow.name ?? canonicalSetId, item: canonicalUrl },
    ],
  };

  const collectionLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${setRow.name ?? canonicalSetId} • Pokémon Set`,
    description: `Browse cards in ${setRow.name ?? canonicalSetId}.`,
    url: canonicalUrl,
    ...(banner ? { image: banner } : {}),
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: total,
      itemListOrder: "https://schema.org/ItemListOrderAscending",
      itemListElement: itemsForLd,
    },
  };

  return (
    <section className="space-y-6">
      <Script id="ld-json-pokemon-set-breadcrumb" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <Script id="ld-json-pokemon-set-collection" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionLd) }} />

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="relative h-20 w-36 shrink-0 overflow-hidden rounded-lg bg-white/5 ring-1 ring-white/10">
            {banner ? (
              <Image src={banner} alt={setRow.name ?? setParam} fill unoptimized className="object-contain" sizes="144px" priority />
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

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-white/80">
          Showing {from}-{to} of {total} cards
          {(q || raresOnly || holoOnly) && <span> (filtered)</span>}
        </div>

        <div className="flex flex-wrap gap-3">
          <form action={baseHref} method="get" className="flex items-center gap-2">
            {q ? <input type="hidden" name="q" value={q} /> : null}
            {raresOnly ? <input type="hidden" name="rares" value="1" /> : null}
            {holoOnly ? <input type="hidden" name="holo" value="1" /> : null}
            <input type="hidden" name="page" value="1" />

            <label htmlFor="pp" className="sr-only">Per page</label>
            <select id="pp" name="perPage" defaultValue={String(perPage)} className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-white">
              {PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>

            <button type="submit" className="rounded-md border border-white/20 bg-white/10 px-2.5 py-1 text-white hover:bg-white/20">
              Apply
            </button>
          </form>

          <form action={baseHref} method="get" className="flex items-center gap-2">
            {raresOnly ? <input type="hidden" name="rares" value="1" /> : null}
            {holoOnly ? <input type="hidden" name="holo" value="1" /> : null}
            <input type="hidden" name="perPage" value={String(perPage)} />
            <input type="hidden" name="page" value="1" />
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search cards (name/rarity/id/number)…"
              className="w-60 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white placeholder:text-white/60 outline-none focus:ring-2 focus:ring-white/50 md:w-[320px]"
            />
            <button type="submit" className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20">
              Search
            </button>

            {(q || raresOnly || holoOnly) && (
              <Link
                href={buildHref(baseHref, { perPage, page: 1, rares: false, holo: false })}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/15"
              >
                Clear
              </Link>
            )}
          </form>

          <form action={baseHref} method="get" className="flex items-center gap-3">
            {q ? <input type="hidden" name="q" value={q} /> : null}
            <input type="hidden" name="perPage" value={String(perPage)} />
            <input type="hidden" name="page" value="1" />

            <label className="inline-flex items-center gap-2 text-sm text-white/90">
              <input type="checkbox" name="rares" value="1" defaultChecked={raresOnly} />
              Rares+
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-white/90">
              <input type="checkbox" name="holo" value="1" defaultChecked={holoOnly} />
              Holo only
            </label>

            <button type="submit" className="rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20">
              Apply
            </button>
          </form>
        </div>
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
            href={buildHref(baseHref, { q, perPage, rares: raresOnly, holo: holoOnly, page: prevPage })}
            aria-disabled={isFirst}
            className={`rounded-md border px-3 py-1 ${
              isFirst ? "pointer-events-none border-white/10 text-white/40" : "border-white/20 text-white hover:bg-white/10"
            }`}
          >
            ← Prev
          </Link>

          <span className="px-2 text-white/80">Page {safePage} of {totalPages}</span>

          <Link
            href={buildHref(baseHref, { q, perPage, rares: raresOnly, holo: holoOnly, page: nextPage })}
            aria-disabled={isLast}
            className={`rounded-md border px-3 py-1 ${
              isLast ? "pointer-events-none border-white/10 text-white/40" : "border-white/20 text-white hover:bg-white/10"
            }`}
          >
            Next →
          </Link>
        </nav>
      )}
    </section>
  );
}
