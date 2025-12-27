import "server-only";

import Link from "next/link";
import Image from "next/image";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const metadata = {
  title: "Pokémon Card Prices, Collection Tracking & Shop | Legendary Collectibles",
  description:
    "Browse Pokémon cards, track prices, manage your collection, and buy singles and sealed products online.",
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
};

const PER_PAGE_OPTIONS = [30, 60, 120, 240] as const;

function parsePerPage(v?: string) {
  const n = Number(v ?? 30);
  return (PER_PAGE_OPTIONS as readonly number[]).includes(n) ? n : 30;
}

function parsePage(v?: string) {
  const n = Number(v ?? 1);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

function buildHref(
  base: string,
  qs: { q?: string | null; page?: number; perPage?: number }
) {
  const p = new URLSearchParams();
  if (qs.q) p.set("q", qs.q);
  if (qs.page) p.set("page", String(qs.page));
  if (qs.perPage) p.set("perPage", String(qs.perPage));
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

/**
 * tcg_sets.release_date is TEXT, often "YYYY/MM/DD" (PokemonTCG) or "YYYY-MM-DD".
 * We compute a date value for ordering without changing schema.
 */
const releaseDateOrderSql = sql`
  CASE
    WHEN release_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN to_date(release_date, 'YYYY-MM-DD')
    WHEN release_date ~ '^[0-9]{4}/[0-9]{2}/[0-9]{2}$' THEN to_date(release_date, 'YYYY/MM/DD')
    ELSE NULL
  END
`;

function pickHttpUrl(a?: string | null, b?: string | null): string | null {
  const raw = (a && a.trim()) || (b && b.trim()) || "";
  if (!raw) return null;
  return /^https?:\/\//i.test(raw) ? raw : null;
}

export default async function SetsIndex({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; perPage?: string }>;
}) {
  const sp = await searchParams;

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
        ORDER BY ${releaseDateOrderSql} DESC NULLS LAST, name ASC NULLS LAST, id ASC
        LIMIT ${perPage} OFFSET ${offset}
      `)
    ).rows ?? [];

  const baseHref = "/categories/pokemon/sets";
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + perPage, total);
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-white">Pokémon Sets</h1>

        <div className="flex flex-wrap gap-3">
          {/* Per-page */}
          <form
            action={baseHref}
            method="get"
            className="flex items-center gap-2"
          >
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
          <form
            action={baseHref}
            method="get"
            className="flex items-center gap-2"
          >
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

      <div className="text-sm text-white/80">
        Showing {from}-{to} of {total} sets {q && "(filtered)"}
      </div>

      {sets.length === 0 ? (
        <div className="rounded-xl border border-white/15 bg-white/5 p-6 text-white/90 backdrop-blur-sm">
          {q ? "No sets matched your search." : "No sets found."}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {sets.map((s) => {
            const img = pickHttpUrl(s.logo_url, s.symbol_url);

            return (
              <li
                key={s.id}
                className="overflow-hidden rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition hover:border-white/20 hover:bg-white/10"
              >
                <Link
                  href={`/categories/pokemon/sets/${encodeURIComponent(s.id)}`}
                  className="block"
                >
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

                    {s.release_date && (
                      <div className="mt-0.5 text-[11px] text-white/70">
                        Released: {s.release_date.replaceAll("/", "-")}
                      </div>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {total > perPage && (
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
            Page {page} of {totalPages}
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
      )}
    </section>
  );
}
