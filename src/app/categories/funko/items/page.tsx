// src/app/categories/funko/items/page.tsx
import "server-only";
import Link from "next/link";
import Image from "next/image";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { CF_ACCOUNT_HASH } from "@/lib/cf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ---------------- types ---------------- */
type CardListRow = {
  id: string;                 // handle
  name: string | null;        // title
  image: string | null;       // primary image (if any)
  image_url: string | null;   // alt image
  image_thumb_url: string | null;
  cf_image_id: string | null;
  image_cf_id: string | null;
  number: string | null;
  brand: string | null;
  franchise: string | null;
  category: string | null;
  series: string[] | null;    // text[]
};

/* ---------------- helpers ---------------- */
const PER_PAGE_OPTIONS = [30, 60, 120, 240] as const;

function parsePerPage(v?: string | string[]): number {
  const s = Array.isArray(v) ? v[0] : v;
  const n = Number(s ?? 30);
  return (PER_PAGE_OPTIONS as readonly number[]).includes(n) ? n : 30;
}
function parsePage(v?: string | string[]): number {
  const s = Array.isArray(v) ? v[0] : v;
  const n = Number(s ?? 1);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}
function buildHref(
  base: string,
  qs: { q?: string | null; page?: number; perPage?: number }
) {
  const p = new URLSearchParams();
  if (qs.q) p.set("q", qs.q);
  if (qs.perPage) p.set("perPage", String(qs.perPage));
  if (qs.page) p.set("page", String(qs.page));
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}
function cfUrl(id: string, variant = "productLarge") {
  return `https://imagedelivery.net/${CF_ACCOUNT_HASH}/${id}/${variant}`;
}
/** prefer CF image > image > image_url > image_thumb_url */
function bestImg(r: CardListRow) {
  return (
    (r.cf_image_id && cfUrl(r.cf_image_id)) ||
    (r.image_cf_id && cfUrl(r.image_cf_id)) ||
    r.image ||
    r.image_url ||
    r.image_thumb_url ||
    null
  );
}
function slugify(s?: string | null) {
  if (!s) return "";
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
}

/* ---------------- page ---------------- */
type SearchParams = { q?: string | string[]; page?: string | string[]; perPage?: string | string[] };

export default async function FunkoItemsIndex({
  searchParams,
}: {
  /** Next 15: searchParams is a Promise */
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const baseHref = "/categories/funko/items";

  const q: string | null = (Array.isArray(sp?.q) ? sp.q[0] : sp?.q)?.trim() || null;
  const perPage: number = parsePerPage(sp?.perPage);
  const reqPage: number = parsePage(sp?.page);
  const page: number = Math.max(1, reqPage);
  const offset: number = (page - 1) * perPage;

  const qLike = q ? `%${q}%` : null;

  // WHERE for search across several fields + series[]
  const where =
    qLike
      ? sql`
        WHERE (
          title ILIKE ${qLike}
          OR handle ILIKE ${qLike}
          OR coalesce(number,'') ILIKE ${qLike}
          OR coalesce(brand,'') ILIKE ${qLike}
          OR coalesce(franchise,'') ILIKE ${qLike}
          OR coalesce(category,'') ILIKE ${qLike}
          OR EXISTS (
            SELECT 1 FROM unnest(coalesce(series,'{}'::text[])) s WHERE s ILIKE ${qLike}
          )
        )`
      : sql``;

  // COUNT
  const countSql = sql<{ count: number }>`
    SELECT COUNT(*)::int AS count
    FROM funko_pops
    ${where}
  `;
  const total: number = Number((await db.execute(countSql)).rows?.[0]?.count ?? 0);

  const totalPages: number = Math.max(1, Math.ceil(total / perPage));
  const safePage: number = Math.min(page, totalPages);
  const safeOffset: number = (safePage - 1) * perPage;

  // PAGE
  const rowsSql = sql<CardListRow>`
    SELECT
      handle AS id,
      title  AS name,
      image,
      image_url,
      image_thumb_url,
      cf_image_id,
      image_cf_id,
      number,
      brand,
      franchise,
      category,
      series
    FROM funko_pops
    ${where}
    ORDER BY title ASC NULLS LAST, handle ASC
    LIMIT ${perPage} OFFSET ${safeOffset}
  `;
  const rows = (await db.execute(rowsSql)).rows as CardListRow[];

  const from: number = total === 0 ? 0 : safeOffset + 1;
  const to: number = Math.min(safeOffset + perPage, total);

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-white">
          <h1 className="text-2xl font-bold">Funko Pop • Items</h1>
          <div className="text-sm text-white/80">
            Showing {from}-{to} of {total}
            {q ? " (filtered)" : ""}
          </div>
        </div>

        {/* search + per page */}
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <form action={baseHref} method="get" className="flex items-center gap-2">
            <input type="hidden" name="perPage" value={String(perPage)} />
            <input type="hidden" name="page" value="1" />
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search… (title/brand/franchise/number/series)"
              className="w-[260px] md:w-[340px] rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white placeholder:text-white/60 outline-none focus:ring-2 focus:ring-white/50"
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
                <option key={String(n)} value={String(n)}>{n}</option>
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

      {/* grid */}
      {rows.length === 0 ? (
        <div className="rounded-xl border border-white/15 bg-white/5 p-6 text-white/90 backdrop-blur-sm">
          {q ? "No items matched your search." : "No items to display."}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {rows.map((c) => {
            const img = bestImg(c);
            const cardHref = `/categories/funko/items/${encodeURIComponent(c.id)}`;
            const series = (c.series ?? []).filter(Boolean);

            return (
              <li
                key={String(c.id)}
                className="rounded-xl border border-white/10 bg-white/5 overflow-hidden backdrop-blur-sm hover:bg-white/10 hover:border-white/20 transition"
              >
                <div className="flex flex-col h-full">
                  {/* Item link (image + title) */}
                  <Link href={cardHref} className="block group flex-1">
                    <div className="relative w-full" style={{ aspectRatio: "3 / 4" }}>
                      {img ? (
                        <Image
                          src={img}
                          alt={c.name ?? c.id}
                          fill
                          unoptimized
                          className="object-contain transition-transform group-hover:scale-[1.02]"
                          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                        />
                      ) : (
                        <div className="absolute inset-0 grid place-items-center text-white/70">
                          No image
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <div className="line-clamp-2 text-sm font-medium text-white group-hover:underline">
                        {c.name ?? c.id}
                      </div>
                    </div>
                  </Link>

                  {/* Meta: number + series chips */}
                  <div className="px-3 pb-3 pt-0 text-xs text-white/80">
                    {c.number ? <span>#{c.number}</span> : <span>&nbsp;</span>}
                    {series.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {series.slice(0, 3).map((s, i) => (
                          <Link
                            key={i}
                            href={`/categories/funko/sets/${encodeURIComponent(slugify(s))}`}
                            className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-white/85 hover:bg-white/10"
                            title={s}
                          >
                            {s}
                          </Link>
                        ))}
                        {series.length > 3 && (
                          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/60">
                            +{series.length - 3} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* pagination */}
      {total > perPage && (
        <nav className="mt-4 flex items-center justify-center gap-2 text-sm">
          <Link
            href={buildHref(baseHref, { q, perPage, page: Math.max(1, page - 1) })}
            aria-disabled={page === 1}
            className={`rounded-md border px-3 py-1 ${
              page === 1 ? "pointer-events-none border-white/10 text-white/40" : "border-white/20 text-white hover:bg-white/10"
            }`}
          >
            ← Prev
          </Link>
          <span className="px-2 text-white/80">Page {page} of {totalPages}</span>
          <Link
            href={buildHref(baseHref, { q, perPage, page: page + 1 })}
            aria-disabled={offset + perPage >= total}
            className={`rounded-md border px-3 py-1 ${
              offset + perPage >= total ? "pointer-events-none border-white/10 text-white/40" : "border-white/20 text-white hover:bg-white/10"
            }`}
          >
            Next →
          </Link>
        </nav>
      )}
    </section>
  );
}
