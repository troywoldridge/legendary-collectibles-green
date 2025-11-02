// src/app/categories/pokemon/cards/page.tsx
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
  name: string | null;
  rarity: string | null;
  set_name: string | null;
  set_id: string | null;
  small_image: string | null;
  large_image: string | null;
};

/* ---------------- helpers ---------------- */
const PER_PAGE_OPTIONS = [30, 60, 120, 240] as const;

function parsePerPage(v?: string): number {
  const n = Number(v ?? 30);
  return (PER_PAGE_OPTIONS as readonly number[]).includes(n) ? n : 30;
}
function parsePage(v?: string): number {
  const n = Number(v ?? 1);
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

/** prefer large > small; external images are unoptimized */
function bestImg(small?: string | null, large?: string | null) {
  return large || small || null;
}

/* ---------------- page ---------------- */
export default async function PokemonCardsIndex({
  searchParams,
}: {
  searchParams?: { q?: string; page?: string; perPage?: string };
}) {
  const baseHref = "/categories/pokemon/cards";

  const q: string | null = (searchParams?.q ?? "").trim() || null;
  const perPage: number = parsePerPage(searchParams?.perPage);
  const reqPage: number = parsePage(searchParams?.page);
  const page: number = Math.max(1, reqPage);
  const offset: number = (page - 1) * perPage;

  // WHERE
  const where = q
    ? sql`WHERE (name ILIKE ${"%" + q + "%"} OR rarity ILIKE ${"%" + q + "%"} OR id ILIKE ${
        "%" + q + "%"
      })`
    : sql``;

  // COUNT
  const countSql = sql<{ count: number }>`
    SELECT COUNT(*)::int AS count
    FROM tcg_cards
    ${where}
  `;
  const total: number = Number(
    (await db.execute(countSql)).rows?.[0]?.count ?? 0
  );

  const totalPages: number = Math.max(1, Math.ceil(total / Number(perPage)));
  const safePage: number = Math.min(page, totalPages);
  const safeOffset: number = (safePage - 1) * Number(perPage);

  // PAGE
  const rowsSql = sql<CardListRow>`
    SELECT
      id, name, rarity, set_name, set_id, small_image, large_image
    FROM tcg_cards
    ${where}
    ORDER BY name ASC NULLS LAST, id ASC
    LIMIT ${Number(perPage)} OFFSET ${safeOffset}
  `;
  const rowsRes = await db.execute(rowsSql);
  const rows: CardListRow[] = (rowsRes.rows ?? []) as CardListRow[];

  const from: number = total === 0 ? 0 : safeOffset + 1;
  const to: number = Math.min(safeOffset + Number(perPage), total);

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-white">
          <h1 className="text-2xl font-bold">Pokémon Cards</h1>
          <div className="text-sm text-white/80">
            Showing {from}-{to} of {total}
            {q ? " (filtered)" : ""}
          </div>
        </div>

        {/* search + per page */}
        <div className="flex flex-wrap gap-3">
          <form action={baseHref} method="get" className="flex items-center gap-2">
            <input type="hidden" name="perPage" value={String(perPage)} />
            <input type="hidden" name="page" value="1" />
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search… (name/rarity/id)"
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

          <form action={baseHref} method="get" className="flex items-center gap-2">
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
                <option key={String(n)} value={String(n)}>
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
        </div>
      </header>

      {/* grid */}
      {rows.length === 0 ? (
        <div className="rounded-xl border border-white/15 bg-white/5 p-6 text-white/90 backdrop-blur-sm">
          {q ? "No cards matched your search." : "No cards to display."}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {rows.map((c) => {
            const img = bestImg(c.small_image, c.large_image);
            const setHref = c.set_name
              ? `/categories/pokemon/sets/${encodeURIComponent(c.set_name)}`
              : c.set_id
              ? `/categories/pokemon/sets/${encodeURIComponent(c.set_id)}`
              : undefined;

            return (
              <li
                key={String(c.id)}
                className="rounded-xl border border-white/10 bg-white/5 overflow-hidden backdrop-blur-sm hover:bg-white/10 hover:border-white/20 transition"
              >
                <Link
                  href={`/categories/pokemon/cards/${encodeURIComponent(c.id)}`}
                  className="block"
                >
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
                    <div className="mt-1 text-xs text-white/80">
                      {c.rarity ?? ""}{" "}
                      {setHref ? (
                        <>
                          {" • "}
                          <Link
                            href={setHref}
                            className="underline hover:no-underline"
                          >
                            {c.set_name ?? c.set_id}
                          </Link>
                        </>
                      ) : null}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* pagination */}
      {total > perPage && (
        <nav className="mt-4 flex items-center justify-center gap-2 text-sm">
          <Link
            href={buildHref(baseHref, {
              q,
              perPage,
              page: Math.max(1, safePage - 1),
            })}
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
            href={buildHref(baseHref, {
              q,
              perPage,
              page: safePage + 1,
            })}
            aria-disabled={safeOffset + perPage >= total}
            className={`rounded-md border px-3 py-1 ${
              safeOffset + perPage >= total
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
