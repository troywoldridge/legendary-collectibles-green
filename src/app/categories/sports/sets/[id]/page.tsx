// src/app/categories/sports/sets/[id]/page.tsx
import "server-only";
import Link from "next/link";
import Image from "next/image";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ---------- Types ---------- */
type SearchParams = Record<string, string | string[] | undefined>;

type SetRow = {
  id: string;
  name: string;
  sport: string;
  year: number | null;
  source: string;
  // representative image for header
  cf_image_id: string | null;
  src_url: string | null;
};

type CardRow = {
  id: string;
  player: string | null;
  team: string | null;
  number: string | null;
  // image per card
  cf_image_id: string | null;
  src_url: string | null;
};

const PER_PAGE_OPTIONS = [30, 60, 120, 240] as const;

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
function buildHref(
  base: string,
  qs: { q?: string | null; page?: number; perPage?: number; team?: string | null }
) {
  const p = new URLSearchParams();
  if (qs.q) p.set("q", qs.q);
  if (qs.team) p.set("team", qs.team);
  if (qs.page) p.set("page", String(qs.page));
  if (qs.perPage) p.set("perPage", String(qs.perPage));
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

const CF_ACCOUNT_HASH =
  process.env.NEXT_PUBLIC_CF_ACCOUNT_HASH || process.env.CF_ACCOUNT_HASH || "";
function cfUrl(cfImageId: string, variant = "card") {
  if (!CF_ACCOUNT_HASH) return null;
  return `https://imagedelivery.net/${CF_ACCOUNT_HASH}/${cfImageId}/${variant}`;
}
function bestImg(cf_image_id: string | null, src_url: string | null, variant?: string) {
  if (cf_image_id) {
    const u = cfUrl(cf_image_id, variant ?? "card") || cfUrl(cf_image_id, "public");
    if (u) return u;
  }
  return src_url || null;
}

/** ---------- Page ---------- */
export default async function SportsSetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id: rawId } = await params;
  const sp = await searchParams;

  const setParam = decodeURIComponent(rawId ?? "").trim();
  const nameGuess = setParam.replace(/-/g, " ").trim();
  const likeGuess = `%${nameGuess}%`;
  const baseHref = `/categories/sports/sets/${encodeURIComponent(setParam)}`;

  const q = (Array.isArray(sp?.q) ? sp.q[0] : sp?.q)?.trim() || null;
  const teamFilter = (Array.isArray(sp?.team) ? sp.team[0] : sp?.team)?.trim() || null;
  const perPage = parsePerPage(sp?.perPage);
  const reqPage = parsePage(sp?.page);

  /** Resolve the set by id or by name-guess */
  const setRow =
    (
      await db.execute<SetRow>(sql`
        WITH pick AS (
          SELECT
            s.id,
            s.name,
            s.sport,
            s.year,
            s.source
          FROM sc_sets s
          WHERE s.id = ${setParam}
             OR lower(s.name) = lower(${nameGuess})
             OR s.name ILIKE ${likeGuess}
          ORDER BY
            CASE WHEN s.id = ${setParam} THEN 0
                 WHEN lower(s.name) = lower(${nameGuess}) THEN 1
                 ELSE 2
            END,
            s.year DESC NULLS LAST
          LIMIT 1
        )
        SELECT
          p.id, p.name, p.sport, p.year, p.source,
          img.cf_image_id, img.src_url
        FROM pick p
        LEFT JOIN LATERAL (
          SELECT i.cf_image_id, i.src_url
          FROM sc_images i
          JOIN sc_cards c ON c.id = i.card_id
          WHERE lower(c.sport) = lower(p.sport)
            AND ( (c.year IS NOT DISTINCT FROM p.year) OR p.year IS NULL )
            AND c.set_name = p.name
          ORDER BY i.is_primary DESC, i.id ASC
          LIMIT 1
        ) AS img ON TRUE
      `)
    ).rows?.[0];

  if (!setRow) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold text-white">Set not found</h1>
        <p className="text-white/70 text-sm break-all">
          Looked up: <code>{setParam}</code>
        </p>
        <Link href="/categories/sports/sets" className="text-sky-300 hover:underline">
          ← Back to all sets
        </Link>
      </section>
    );
  }

  /** Cards query */
  const cardConds = [
    sql`lower(c.sport) = lower(${setRow.sport})`,
    setRow.year === null ? sql`TRUE` : sql`(c.year IS NOT DISTINCT FROM ${setRow.year})`,
    sql`c.set_name = ${setRow.name}`,
  ];

  if (q) {
    const like = `%${q}%`;
    cardConds.push(
      sql`(c.player ILIKE ${like} OR c.team ILIKE ${like} OR c.number ILIKE ${like} OR c.id ILIKE ${like})`
    );
  }
  if (teamFilter) {
    cardConds.push(sql`c.team ILIKE ${"%" + teamFilter + "%"}`);
  }

  const whereCards = sql.join(cardConds, sql` AND `);

  // Count
  const total =
    (
      await db.execute<{ count: number }>(
        sql`SELECT COUNT(*)::int AS count FROM sc_cards c WHERE ${whereCards}`
      )
    ).rows?.[0]?.count ?? 0;

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(totalPages, reqPage);
  const offset = (safePage - 1) * perPage;

  // Page slice (with image per card via lateral)
  const cards =
    (
      await db.execute<CardRow>(sql`
        SELECT
          c.id,
          c.player,
          c.team,
          c.number,
          img.cf_image_id,
          img.src_url
        FROM sc_cards c
        LEFT JOIN LATERAL (
          SELECT i.cf_image_id, i.src_url
          FROM sc_images i
          WHERE i.card_id = c.id
          ORDER BY i.is_primary DESC, i.id ASC
          LIMIT 1
        ) AS img ON TRUE
        WHERE ${whereCards}
        ORDER BY
          -- try to sort nicely: numeric-ish number then player then id
          NULLIF(regexp_replace(c.number, '\\D', '', 'g'), '')::int NULLS LAST,
          c.player ASC NULLS LAST,
          c.id ASC
        LIMIT ${perPage} OFFSET ${offset}
      `)
    ).rows ?? [];

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + perPage, total);

  const headerImg = bestImg(setRow.cf_image_id, setRow.src_url, "category");
  const subtitleBits = [
    setRow.sport ? setRow.sport[0].toUpperCase() + setRow.sport.slice(1) : undefined,
    setRow.year ? String(setRow.year) : undefined,
  ].filter(Boolean);
  const subtitle = subtitleBits.join(" • ");

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="relative h-20 w-36 shrink-0 rounded-lg bg-white/5 ring-1 ring-white/10 overflow-hidden">
            {headerImg ? (
              <Image
                src={headerImg}
                alt={setRow.name}
                fill
                unoptimized
                className="object-contain"
                sizes="144px"
                priority
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center text-white/60 text-xs">
                No image
              </div>
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">
              {setRow.year ? `${setRow.year} ${setRow.name}` : setRow.name}
            </h1>
            {subtitle && <div className="text-sm text-white/80">{subtitle}</div>}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* (Optional) Add price overview route later if desired */}
          <Link href="/categories/sports/sets" className="text-sky-300 hover:underline">
            ← All sets
          </Link>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-white/80">
          Showing {from}-{to} of {total} cards {(q || teamFilter) && <span> (filtered)</span>}
        </div>

        <div className="flex flex-wrap gap-3">
          {/* Per page */}
          <form action={baseHref} method="get" className="flex items-center gap-2">
            {q ? <input type="hidden" name="q" value={q} /> : null}
            {teamFilter ? <input type="hidden" name="team" value={teamFilter} /> : null}
            <input type="hidden" name="page" value="1" />
            <label htmlFor="pp" className="sr-only">Per page</label>
            <select id="pp" name="perPage" defaultValue={String(perPage)}
              className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-white">
              {PER_PAGE_OPTIONS.map((n) => (<option key={n} value={n}>{n}</option>))}
            </select>
            <button type="submit" className="rounded-md border border-white/20 bg-white/10 px-2.5 py-1 text-white hover:bg-white/20">
              Apply
            </button>
          </form>

          {/* Search within set */}
          <form action={baseHref} method="get" className="flex items-center gap-2">
            {teamFilter ? <input type="hidden" name="team" value={teamFilter} /> : null}
            <input type="hidden" name="perPage" value={String(perPage)} />
            <input type="hidden" name="page" value="1" />
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search cards (player/team/number/id)…"
              className="w-[240px] md:w-[320px] rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white placeholder:text-white/60 outline-none focus:ring-2 focus:ring-white/50"
            />
            <button type="submit" className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20">
              Search
            </button>
            {q && (
              <Link
                href={buildHref(baseHref, { perPage, page: 1, team: teamFilter })}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/15"
              >
                Clear
              </Link>
            )}
          </form>

          {/* Team filter */}
          <form action={baseHref} method="get" className="flex items-center gap-2">
            {q ? <input type="hidden" name="q" value={q} /> : null}
            <input type="hidden" name="perPage" value={String(perPage)} />
            <input type="hidden" name="page" value="1" />
            <input
              name="team"
              defaultValue={teamFilter ?? ""}
              placeholder="Filter by team…"
              className="w-[200px] rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white placeholder:text-white/60 outline-none focus:ring-2 focus:ring-white/50"
            />
            <button type="submit" className="rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20">
              Apply
            </button>
          </form>
        </div>
      </div>

      {/* Cards grid */}
      {cards.length === 0 ? (
        <div className="rounded-xl border border-white/15 bg-white/5 p-6 text-white/90 backdrop-blur-sm">
          {q || teamFilter ? "No cards matched your filters." : "No cards found in this set."}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {cards.map((c) => {
            const img = bestImg(c.cf_image_id, c.src_url, "card");
            const title = c.player || c.id;
            const sub = [c.team ?? "", c.number ?? ""].filter(Boolean).join(" • ");
            return (
              <li
                key={c.id}
                className="rounded-xl border border-white/10 bg-white/5 overflow-hidden backdrop-blur-sm hover:bg-white/10 hover:border-white/20 transition"
              >
                <Link href={`/categories/sports/cards/${encodeURIComponent(c.id)}`} className="block">
                  <div className="relative w-full" style={{ aspectRatio: "3 / 4" }}>
                    {img ? (
                      <Image
                        src={img}
                        alt={title ?? c.id}
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
                    <div className="line-clamp-2 text-sm font-medium text-white">{title}</div>
                    <div className="mt-1 text-xs text-white/80">{sub}</div>
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
            href={buildHref(baseHref, { q, perPage, team: teamFilter, page: Math.max(1, safePage - 1) })}
            aria-disabled={safePage === 1}
            className={`rounded-md border px-3 py-1 ${
              safePage === 1
                ? "pointer-events-none border-white/10 text-white/40"
                : "border-white/20 text-white hover:bg-white/10"
            }`}
          >
            ← Prev
          </Link>
          <span className="px-2 text-white/80">
            Page {safePage} of {totalPages}
          </span>
          <Link
            href={buildHref(baseHref, { q, perPage, team: teamFilter, page: safePage + 1 })}
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
