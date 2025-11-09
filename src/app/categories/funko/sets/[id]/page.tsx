// src/app/categories/funko/sets/[id]/page.tsx
import "server-only";
import Link from "next/link";
import Image from "next/image";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { CF_ACCOUNT_HASH } from "@/lib/cf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SetRow = {
  id: string;
  name: string | null;
  series: string | null;
  release_date: string | null;
  logo_url: string | null;
  symbol_url: string | null;
};

type ItemRow = {
  id: string;                // handle
  name: string | null;       // title
  image: string | null;
  image_url: string | null;
  image_thumb_url: string | null;
  cf_image_id: string | null;
  image_cf_id: string | null;
  image_primary: string | null; // from funko_products_raw
  images: string[] | null;      // from funko_products_raw
};

type SearchParams = Record<string, string | string[] | undefined>;

const CATEGORY = {
  label: "Funko Pop",
  baseListHref: "/categories/funko/sets",
  bannerCfId: "48efbf88-be1f-4a1f-f3f7-892fe21b5000",
} as const;

const PER_PAGE_OPTIONS = [30, 60, 120, 240] as const;

const cfImageUrl = (id?: string | null, variant = "categoryThumb") =>
  id ? `https://imagedelivery.net/${CF_ACCOUNT_HASH}/${id}/${variant}` : null;

function first<T>(arr?: T[] | null): T | null {
  return Array.isArray(arr) && arr.length ? (arr[0] as T) : null;
}

function pickImgURL(fields: {
  cf_image_id?: string | null;
  image_cf_id?: string | null;
  image?: string | null;
  image_url?: string | null;
  image_thumb_url?: string | null;
  image_primary?: string | null;
  images?: string[] | null;
}) {
  return (
    cfImageUrl(fields.cf_image_id, "productLarge") ||
    cfImageUrl(fields.image_cf_id, "productLarge") ||
    fields.image ||
    fields.image_url ||
    fields.image_thumb_url ||
    fields.image_primary ||
    first(fields.images) ||
    null
  );
}

function parsePerPage(v?: string | string[]) {
  const s = Array.isArray(v) ? v[0] : v;
  const n = Number(s ?? 30);
  return (PER_PAGE_OPTIONS as readonly number[]).includes(n) ? n : 30;
}
function parsePage(v?: string | string[]) {
  const s = Array.isArray(v) ? v[0] : v;
  const n = Number(s ?? 1);
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

async function hasMV(name: string): Promise<boolean> {
  const row = (
    await db.execute<{ t: string | null }>(sql`SELECT to_regclass(${name}) AS t`)
  ).rows?.[0];
  return !!row?.t;
}


/** Resolve a clean series name from slug (robust) */
async function resolveSeriesNameFromSlug(slug: string): Promise<string | null> {
  const mv = (await db.execute<{ series: string }>(sql`
    SELECT series FROM funko_series_mv WHERE slug = ${slug} LIMIT 1
  `)).rows?.[0]?.series ?? null;

  if (mv) return mv;

  // fallback (rare)
  const ilike = `%${slug.replace(/-/g, "%")}%`;
  const row = (await db.execute<{ series: string }>(sql`
    SELECT btrim(t.series) AS series
    FROM (SELECT DISTINCT unnest(COALESCE(series,'{}'))::text AS series FROM funko_pops) t
    WHERE lower(regexp_replace(btrim(t.series), '[^a-z0-9]+', '-', 'g')) = lower(${slug})
       OR btrim(t.series) ILIKE ${ilike}
    ORDER BY length(btrim(t.series)) ASC
    LIMIT 1
  `)).rows?.[0] ?? null;

  return row?.series ?? null;
}

async function getSet(setSlug: string): Promise<SetRow | null> {
  const mvOk = await hasMV('public.funko_series_mv');
  if (mvOk) {
    const mv = (
      await db.execute<{
        series: string | null;
        cf_image_id: string | null;
        image_cf_id: string | null;
        image: string | null;
        image_url: string | null;
        image_thumb_url: string | null;
        image_primary: string | null;
        images: string[] | null;
      }>(sql`
        SELECT series, cf_image_id, image_cf_id, image, image_url, image_thumb_url, image_primary, images
        FROM funko_series_mv
        WHERE slug = ${setSlug}
        LIMIT 1
      `)
    ).rows?.[0] ?? null;

    if (mv?.series) {
      return {
        id: setSlug,
        name: mv.series,
        series: mv.series,
        release_date: null,
        logo_url: pickImgURL(mv),
        symbol_url: null,
      };
    }
  }

  // fallback (your previous logic)
  const seriesName =
    (await resolveSeriesNameFromSlug(setSlug)) || setSlug.replace(/-/g, " ");
  if (!seriesName) return null;

  // optional: leave the previous representative-image query in place
  return { id: setSlug, name: seriesName, series: seriesName, release_date: null, logo_url: null, symbol_url: null };
}

async function getItems(_opts: {
  setSlug: string;
  seriesName: string;
  q: string | null;
  offset: number;
  limit: number;
}) {
  const useMV = await hasMV('public.funko_series_items_mv');
  const qLike = _opts.q ? `%${_opts.q}%` : null;

  if (useMV) {
    const total = (
      await db.execute<{ count: number }>(sql`
        SELECT COUNT(*)::int AS count
        FROM funko_series_items_mv
        WHERE slug = ${_opts.setSlug}
        ${qLike ? sql`AND (title ILIKE ${qLike} OR handle ILIKE ${qLike})` : sql``}
      `)
    ).rows?.[0]?.count ?? 0;

    const rows = (
      await db.execute<ItemRow>(sql`
        SELECT
          handle AS id,
          title  AS name,
          image, image_url, image_thumb_url, cf_image_id, image_cf_id,
          image_primary, images
        FROM funko_series_items_mv
        WHERE slug = ${_opts.setSlug}
        ${qLike ? sql`AND (title ILIKE ${qLike} OR handle ILIKE ${qLike})` : sql``}
        ORDER BY title ASC NULLS LAST, handle ASC
        LIMIT ${_opts.limit} OFFSET ${_opts.offset}
      `)
    ).rows ?? [];

    return { rows, total };
  }

  // ── fallback (works but slower) ──────────────────────────────────────────────
  const ilikePattern = `%${_opts.setSlug.replace(/-/g, "%")}%`;

  const total = (
    await db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count
      FROM funko_pops fp
      WHERE EXISTS (
        SELECT 1
        FROM unnest(COALESCE(fp.series,'{}'::text[])) s
        WHERE
          lower(btrim(s)) = lower(${_opts.seriesName})
          OR lower(regexp_replace(btrim(s), '[^a-z0-9]+', '-', 'g')) = lower(${_opts.setSlug})
          OR btrim(s) ILIKE ${ilikePattern}
      )
      ${qLike ? sql`AND (fp.title ILIKE ${qLike} OR fp.handle ILIKE ${qLike})` : sql``}
    `)
  ).rows?.[0]?.count ?? 0;

  const rows = (
    await db.execute<ItemRow>(sql`
      SELECT
        fp.handle AS id,
        fp.title  AS name,
        fp.image,
        fp.image_url,
        fp.image_thumb_url,
        fp.cf_image_id,
        fp.image_cf_id,
        fpr.image_primary,
        fpr.images
      FROM funko_pops fp
      LEFT JOIN funko_products_raw fpr ON fpr.url = fp.external_url
      WHERE EXISTS (
        SELECT 1
        FROM unnest(COALESCE(fp.series,'{}'::text[])) s
        WHERE
          lower(btrim(s)) = lower(${_opts.seriesName})
          OR lower(regexp_replace(btrim(s), '[^a-z0-9]+', '-', 'g')) = lower(${_opts.setSlug})
          OR btrim(s) ILIKE ${ilikePattern}
      )
      ${qLike ? sql`AND (fp.title ILIKE ${qLike} OR fp.handle ILIKE ${qLike})` : sql``}
      ORDER BY fp.title ASC NULLS LAST, fp.handle ASC
      LIMIT ${_opts.limit} OFFSET ${_opts.offset}
    `)
  ).rows ?? [];

  return { rows, total };
}

export default async function FunkoSetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id: rawId } = await params;
  const sp = await searchParams;

  const setParam = decodeURIComponent(rawId ?? "").trim();
  const baseHref = `${CATEGORY.baseListHref}/${encodeURIComponent(setParam)}`;

  const q = (Array.isArray(sp?.q) ? sp.q[0] : sp?.q)?.trim() || null;
  const perPage = parsePerPage(sp?.perPage);
  const reqPage = parsePage(sp?.page);

  const setRow = await getSet(setParam);
  if (!setRow) {
    return (
      <section className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Series not found</h1>
        <Link href={CATEGORY.baseListHref} className="text-sky-300 hover:underline">
          ← Back to all series
        </Link>
      </section>
    );
  }

  const { rows, total } = await getItems({
    setSlug: setParam,
    seriesName: setRow.name!,
    q,
    offset: (reqPage - 1) * perPage,
    limit: perPage,
  });

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(totalPages, reqPage);
  const offset = (page - 1) * perPage;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + perPage, total);

  const banner = setRow.logo_url || cfImageUrl(CATEGORY.bannerCfId);

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="relative h-20 w-36 shrink-0 rounded-lg bg-white/5 ring-1 ring-white/10 overflow-hidden">
            {banner ? (
              <Image
                src={banner}
                alt={setRow?.name ?? setParam}
                fill
                unoptimized
                className="object-contain"
                sizes="144px"
                priority
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center text-white/60">Funko</div>
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">
              {CATEGORY.label}: {setRow?.name ?? setParam}
            </h1>
            <div className="text-sm text-white/80">Series browser & figure index</div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Link href={CATEGORY.baseListHref} className="text-sky-300 hover:underline">
            ← All {CATEGORY.label} series
          </Link>
          <Link href="/categories" className="text-sky-300 hover:underline">
            ← All categories
          </Link>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-white/80">
          Showing {from}-{to} of {total} items{q ? " (filtered)" : ""}
        </div>
        <div className="flex flex-wrap gap-3">
          {/* Per page */}
          <form action={baseHref} method="get" className="flex items-center gap-2">
            {q ? <input type="hidden" name="q" value={q} /> : null}
            <input type="hidden" name="page" value="1" />
            <label htmlFor="pp" className="sr-only">Per page</label>
            <select
              id="pp"
              name="perPage"
              defaultValue={String(perPage)}
              className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-white"
            >
              {PER_PAGE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <button type="submit" className="rounded-md border border-white/20 bg-white/10 px-2.5 py-1 text-white hover:bg-white/20">
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
              placeholder="Search figures (name)…"
              className="w-[240px] md:w-[320px] rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white placeholder:text-white/60 outline-none focus:ring-2 focus:ring-white/50"
            />
            <button
              type="submit"
              className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20"
            >
              Search
            </button>
            {q && (
              <Link
                href={buildHref(baseHref, { perPage, page: 1 })}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/15"
              >
                Clear
              </Link>
            )}
          </form>
        </div>
      </div>

      {/* Grid */}
      {rows.length === 0 ? (
        <div className="rounded-xl border border-white/15 bg-white/5 p-6 text-white/90 backdrop-blur-sm">
          No items yet.
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {rows.map((c) => {
            const img = pickImgURL(c);
            return (
              <li
                key={c.id}
                className="rounded-xl border border-white/10 bg-white/5 overflow-hidden backdrop-blur-sm hover:bg-white/10 hover:border-white/20 transition"
              >
                <Link href={`/categories/funko/items/${encodeURIComponent(c.id)}`} className="block" prefetch={false}>
                  <div className="relative w-full" style={{ aspectRatio: "3 / 4" }}>
                    {img ? (
                      <Image
                        src={img}
                        alt={c.name ?? c.id}
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
                  </div>
                  <div className="p-3">
                    <div className="line-clamp-2 text-sm font-medium text-white">
                      {c.name ?? c.id}
                    </div>
                    <div className="mt-1 text-xs text-white/80">&nbsp;</div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* Pagination */}
      {total > perPage && (
        <nav className="mt-4 flex items-center justify-center gap-2 text-sm">
          <Link
            href={buildHref(baseHref, { q, perPage, page: Math.max(1, page - 1) })}
            aria-disabled={page === 1}
            className={`rounded-md border px-3 py-1 ${page === 1 ? "pointer-events-none border-white/10 text-white/40" : "border-white/20 text-white hover:bg-white/10"}`}
          >
            ← Prev
          </Link>
          <span className="px-2 text-white/80">Page {page} of {totalPages}</span>
          <Link
            href={buildHref(baseHref, { q, perPage, page: page + 1 })}
            aria-disabled={offset + perPage >= total}
            className={`rounded-md border px-3 py-1 ${offset + perPage >= total ? "pointer-events-none border-white/10 text-white/40" : "border-white/20 text-white hover:bg-white/10"}`}
          >
            Next →
          </Link>
        </nav>
      )}
    </section>
  );
}
