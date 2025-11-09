// src/app/categories/sports/cards/page.tsx
import "server-only";
import Link from "next/link";
import Image from "next/image";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ---------------- types ---------------- */
type CardListRow = {
  id: string;
  player: string | null;
  team: string | null;
  number: string | null;
  sport: string | null;
  year: number | null;
  set_name: string | null;
  set_id: string | null;       // resolved from sc_sets
  cf_image_id: string | null;  // from sc_images
  src_url: string | null;      // from sc_images
};

/* ---------------- helpers ---------------- */
const PER_PAGE_OPTIONS = [30, 60, 120, 240] as const;
const SPORTS = ["baseball", "basketball", "football"] as const;

function parsePerPage(v?: string): number {
  const n = Number(v ?? 30);
  return (PER_PAGE_OPTIONS as readonly number[]).includes(n) ? n : 30;
}
function parsePage(v?: string): number {
  const n = Number(v ?? 1);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}
function normSport(v?: string | null) {
  const s = (v ?? "").toLowerCase();
  return (SPORTS as readonly string[]).includes(s) ? s : null;
}
function buildHref(
  base: string,
  qs: { q?: string | null; page?: number; perPage?: number; sport?: string | null }
) {
  const p = new URLSearchParams();
  if (qs.q) p.set("q", qs.q);
  if (qs.perPage) p.set("perPage", String(qs.perPage));
  if (qs.page) p.set("page", String(qs.page));
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
function bestImg(row: Pick<CardListRow, "cf_image_id" | "src_url">): string | null {
  if (row.cf_image_id) {
    return (
      cfUrl(row.cf_image_id, "card") ||
      cfUrl(row.cf_image_id, "public") ||
      cfUrl(row.cf_image_id, "category")
    );
  }
  return row.src_url || null;
}

/* ---------------- page ---------------- */
type SearchParams = { q?: string; page?: string; perPage?: string; sport?: string };

export default async function SportsCardsIndex({
  searchParams,
}: {
  /** Next 15: searchParams is a Promise */
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const baseHref = "/categories/sports/cards";

  const q: string | null = (sp?.q ?? "").trim() || null;
  const perPage: number = parsePerPage(sp?.perPage);
  const reqPage: number = parsePage(sp?.page);
  const page: number = Math.max(1, reqPage);
  const offset: number = (page - 1) * perPage;
  const sport = normSport(sp?.sport ?? null);

  // WHERE
  const conds = [sql`1=1`];
  if (q) {
    const like = `%${q}%`;
    conds.push(
      sql`(c.player ILIKE ${like} OR c.team ILIKE ${like} OR c.set_name ILIKE ${like} OR c.number ILIKE ${like} OR c.id ILIKE ${like} OR CAST(c.year AS TEXT) ILIKE ${like})`
    );
  }
  if (sport) conds.push(sql`lower(c.sport) = ${sport}`);
  const whereSql = sql.join(conds, sql` AND `);

  // COUNT
  const total: number =
    (
      await db.execute<{ count: number }>(
        sql`SELECT COUNT(*)::int AS count FROM sc_cards c WHERE ${whereSql}`
      )
    ).rows?.[0]?.count ?? 0;

  const totalPages: number = Math.max(1, Math.ceil(total / Number(perPage)));
  const safePage: number = Math.min(page, totalPages);
  const safeOffset: number = (safePage - 1) * Number(perPage);

  // PAGE
  const rows =
    (
      await db.execute<CardListRow>(sql`
        SELECT
          c.id,
          c.player,
          c.team,
          c.number,
          c.sport,
          c.year,
          c.set_name,
          setpick.set_id,
          img.cf_image_id,
          img.src_url
        FROM sc_cards c
        -- resolve set_id by name/sport/year (allow NULL year matches)
        LEFT JOIN LATERAL (
          SELECT s.id AS set_id
          FROM sc_sets s
          WHERE lower(s.sport) = lower(c.sport)
            AND s.name = c.set_name
            AND ( (s.year IS NOT DISTINCT FROM c.year) OR s.year IS NULL )
          ORDER BY s.year DESC NULLS LAST
          LIMIT 1
        ) AS setpick ON TRUE
        -- pick a primary image for the card
        LEFT JOIN LATERAL (
          SELECT i.cf_image_id, i.src_url
          FROM sc_images i
          WHERE i.card_id = c.id
          ORDER BY i.is_primary DESC, i.id ASC
          LIMIT 1
        ) AS img ON TRUE
        WHERE ${whereSql}
        ORDER BY
          NULLIF(regexp_replace(c.number, '\\D', '', 'g'), '')::int NULLS LAST,
          c.player ASC NULLS LAST,
          c.id ASC
        LIMIT ${Number(perPage)} OFFSET ${safeOffset}
      `)
    ).rows ?? [];

  const from: number = total === 0 ? 0 : safeOffset + 1;
  const to: number = Math.min(safeOffset + Number(perPage), total);

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-white">
          <h1 className="text-2xl font-bold">Sports Cards</h1>
          <div className="text-sm text-white/80">
            Showing {from}-{to} of {total}
            {(q || sport) ? " (filtered)" : ""}
          </div>
        </div>

        {/* search + per page + sport */}
        <div className="flex flex-wrap gap-3">
          {/* search */}
          <form action={baseHref} method="get" className="flex items-center gap-2">
            {sport ? <input type="hidden" name="sport" value={sport} /> : null}
            <input type="hidden" name="perPage" value={String(perPage)} />
            <input type="hidden" name="page" value="1" />
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search… (player/team/set/number/id/year)"
              className="w-[260px] md:w-[320px] rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white placeholder:text-white/60 outline-none focus:ring-2 focus:ring-white/50"
            />
            <button
              type="submit"
              className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20"
            >
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

          {/* sport filter */}
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
            <button
              type="submit"
              className="rounded-md border border-white/20 bg-white/10 px-2.5 py-1 text-white hover:bg-white/20"
            >
              Apply
            </button>
          </form>

          {/* per page */}
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
          {q || sport ? "No cards matched your search." : "No cards to display."}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {rows.map((c) => {
            const img = bestImg(c);
            const cardHref = `/categories/sports/cards/${encodeURIComponent(c.id)}`;
            const setHref = c.set_id
              ? `/categories/sports/sets/${encodeURIComponent(c.set_id)}`
              : c.set_name
              ? `/categories/sports/sets/${encodeURIComponent(c.set_name)}`
              : undefined;
            const metaBits = [
              c.sport ? c.sport[0].toUpperCase() + c.sport.slice(1) : null,
              c.year != null ? String(c.year) : null,
              c.number || null,
            ].filter(Boolean);

            return (
              <li
                key={String(c.id)}
                className="rounded-xl border border-white/10 bg-white/5 overflow-hidden backdrop-blur-sm hover:bg-white/10 hover:border-white/20 transition"
              >
                <div className="flex flex-col h-full">
                  <Link href={cardHref} className="block group flex-1">
                    <div className="relative w-full" style={{ aspectRatio: "3 / 4" }}>
                      {img ? (
                        <Image
                          src={img}
                          alt={c.player ?? c.id}
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
                        {c.player ?? c.id}
                      </div>
                      <div className="mt-1 text-xs text-white/70">{metaBits.join(" • ")}</div>
                    </div>
                  </Link>

                  <div className="px-3 pb-3 pt-0 text-xs text-white/80">
                    {c.team ?? ""}
                    {setHref ? (
                      <>
                        {" • "}
                        <Link href={setHref} className="underline hover:no-underline">
                          {c.set_name ?? c.set_id}
                        </Link>
                      </>
                    ) : null}
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
            href={buildHref(baseHref, { q, perPage, sport, page: Math.max(1, page - 1) })}
            aria-disabled={page === 1}
            className={`rounded-md border px-3 py-1 ${
              page === 1 ? "pointer-events-none border-white/10 text-white/40" : "border-white/20 text-white hover:bg-white/10"
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
