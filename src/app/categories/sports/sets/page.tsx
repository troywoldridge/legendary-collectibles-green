// src/app/categories/sports/sets/page.tsx
import "server-only";
import Link from "next/link";
import Image from "next/image";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type SetRow = {
  id: string;
  name: string;
  sport: string;
  year: number | null;
  source: string;
  // Representative image (from any card in the set), if available
  cf_image_id: string | null;
  src_url: string | null;
};

const PER_PAGE_OPTIONS = [30, 60, 120, 240] as const;
const SPORTS = ["baseball", "basketball", "football"] as const;

function parsePerPage(v?: string) {
  const n = Number(v ?? 30);
  return (PER_PAGE_OPTIONS as readonly number[]).includes(n) ? n : 30;
}
function parsePage(v?: string) {
  const n = Number(v ?? 1);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}
function normSport(v?: string | null) {
  const s = (v ?? "").toLowerCase();
  return (SPORTS as readonly string[]).includes(s) ? (s as typeof SPORTS[number]) : null;
}

function buildHref(
  base: string,
  qs: { q?: string | null; page?: number; perPage?: number; sport?: string | null }
) {
  const p = new URLSearchParams();
  if (qs.q) p.set("q", qs.q);
  if (qs.page) p.set("page", String(qs.page));
  if (qs.perPage) p.set("perPage", String(qs.perPage));
  if (qs.sport) p.set("sport", qs.sport);
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

const CF_ACCOUNT_HASH =
  process.env.NEXT_PUBLIC_CF_ACCOUNT_HASH || process.env.CF_ACCOUNT_HASH || "";
function cfUrl(cfImageId: string, variant = "card") {
  if (!CF_ACCOUNT_HASH) return null;
  return `https://imagedelivery.net/${CF_ACCOUNT_HASH}/${cfImageId}/${variant}`;
}
function bestSetImage(row: Pick<SetRow, "cf_image_id" | "src_url">): string | null {
  if (row.cf_image_id) {
    const u = cfUrl(row.cf_image_id, "category") || cfUrl(row.cf_image_id, "public") || cfUrl(row.cf_image_id, "card");
    if (u) return u;
  }
  return row.src_url || null;
}

export default async function SportsSetsIndex({
  searchParams,
}: {
  searchParams?: { q?: string; page?: string; perPage?: string; sport?: string };
}) {
  const baseHref = "/categories/sports/sets";
  const q = (searchParams?.q ?? "").trim() || null;
  const sport = normSport(searchParams?.sport ?? null);
  const perPage = parsePerPage(searchParams?.perPage);
  const reqPage = parsePage(searchParams?.page);
  const page = Math.max(1, reqPage);
  const offset = (page - 1) * perPage;

  // Build WHERE conditions
  const conditions = [sql`1=1`];
  if (q) {
    // match set name, id, or year text
    const like = `%${q}%`;
    conditions.push(
      sql`(s.name ILIKE ${like} OR s.id ILIKE ${like} OR CAST(s.year AS TEXT) ILIKE ${like})`
    );
  }
  if (sport) {
    conditions.push(sql`lower(s.sport) = ${sport}`);
  }
  const whereSql = sql.join(conditions, sql` AND `);

  // Count total
  const total =
    (
      await db.execute<{ count: number }>(
        sql`SELECT COUNT(*)::int AS count FROM sc_sets s WHERE ${whereSql}`
      )
    ).rows?.[0]?.count ?? 0;

  // Page rows, with a LATERAL pick for a representative image from any card in the set
  const rows = (
    await db.execute<SetRow>(sql`
      SELECT
        s.id,
        s.name,
        s.sport,
        s.year,
        s.source,
        img.cf_image_id,
        img.src_url
      FROM sc_sets s
      LEFT JOIN LATERAL (
        SELECT i.cf_image_id, i.src_url
        FROM sc_images i
        JOIN sc_cards c ON c.id = i.card_id
        WHERE lower(c.sport) = lower(s.sport)
          AND ( (c.year IS NOT DISTINCT FROM s.year) OR s.year IS NULL )
          AND c.set_name = s.name
        ORDER BY i.is_primary DESC, i.id ASC
        LIMIT 1
      ) AS img ON TRUE
      WHERE ${whereSql}
      ORDER BY s.year DESC NULLS LAST, s.name ASC
      LIMIT ${perPage} OFFSET ${offset}
    `)
  ).rows ?? [];

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + perPage, total);

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-white">Sports Card Sets</h1>

        {/* Toolbar */}
        <div className="flex flex-wrap gap-3">
          {/* Per-page */}
          <form action={baseHref} method="get" className="flex items-center gap-2">
            {q ? <input type="hidden" name="q" value={q} /> : null}
            {sport ? <input type="hidden" name="sport" value={sport} /> : null}
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
            <button className="rounded-md border border-white/20 bg-white/10 px-2.5 py-1 text-white hover:bg-white/20">
              Apply
            </button>
          </form>

          {/* Search */}
          <form action={baseHref} method="get" className="flex items-center gap-2">
            {sport ? <input type="hidden" name="sport" value={sport} /> : null}
            <input type="hidden" name="perPage" value={String(perPage)} />
            <input type="hidden" name="page" value="1" />
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search sets (name/id/year)…"
              className="w-[240px] md:w-[320px] rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white placeholder:text-white/60 outline-none focus:ring-2 focus:ring-white/50"
            />
            <button className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20">
              Search
            </button>
            {q && (
              <Link
                href={buildHref(baseHref, { perPage, page: 1, sport })}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/15"
              >
                Clear
              </Link>
            )}
          </form>

          {/* Sport filter */}
          <form action={baseHref} method="get" className="flex items-center gap-2">
            {q ? <input type="hidden" name="q" value={q} /> : null}
            <input type="hidden" name="perPage" value={String(perPage)} />
            <input type="hidden" name="page" value="1" />
            <label htmlFor="sport" className="sr-only">Sport</label>
            <select
              id="sport"
              name="sport"
              defaultValue={sport ?? ""}
              className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-white"
            >
              <option value="">All sports</option>
              {SPORTS.map((s) => (
                <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
            <button className="rounded-md border border-white/20 bg-white/10 px-2.5 py-1 text-white hover:bg-white/20">
              Apply
            </button>
          </form>
        </div>
      </div>

      <div className="text-sm text-white/80">
        Showing {from}-{to} of {total} sets {(q || sport) && "(filtered)"}
      </div>

      {/* Grid */}
      {rows.length === 0 ? (
        <div className="rounded-xl border border-white/15 bg-white/5 p-6 text-white/90 backdrop-blur-sm">
          {q || sport ? "No sets matched your search." : "No sets found."}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {rows.map((s) => {
            const img = bestSetImage(s);
            return (
              <li
                key={s.id}
                className="rounded-xl border border-white/10 bg-white/5 overflow-hidden backdrop-blur-sm hover:bg-white/10 hover:border-white/20 transition"
              >
                <Link href={`/categories/sports/sets/${encodeURIComponent(s.id)}`} className="block">
                  <div className="relative w-full" style={{ aspectRatio: "16 / 9" }}>
                    {img ? (
                      <Image
                        src={img}
                        alt={`${s.year ?? ""} ${s.name}`.trim() || s.id}
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
                    <div className="line-clamp-2 text-sm font-semibold text-white">
                      {s.year ? `${s.year} ${s.name}` : s.name}
                    </div>
                    <div className="mt-1 text-xs text-white/80">
                      {s.sport ? s.sport[0].toUpperCase() + s.sport.slice(1) : ""}
                    </div>
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
            href={buildHref(baseHref, { q, perPage, sport, page: Math.max(1, page - 1) })}
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
            href={buildHref(baseHref, { q, perPage, sport, page: page + 1 })}
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
      )}
    </section>
  );
}
