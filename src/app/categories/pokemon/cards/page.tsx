import "server-only";
import Link from "next/link";
import Image from "next/image";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import PerPageSelect from "@/components/PerPageSelect";

export const dynamic = "force-dynamic";

const PER_PAGE_OPTIONS = [24, 30, 48, 60, 96, 120] as const;
const DEFAULT_PER_PAGE = 30;

type SearchParamsLike = Record<string, string | string[] | undefined>;

function pick(sp: SearchParamsLike | undefined, key: string): string | undefined {
  const v = sp?.[key];
  return Array.isArray(v) ? v[0] : v;
}
function readPerPage(sp: SearchParamsLike | undefined): number {
  const raw = pick(sp, "perPage");
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && (PER_PAGE_OPTIONS as readonly number[]).includes(n) ? n : DEFAULT_PER_PAGE;
}
function readPage(sp: SearchParamsLike | undefined): number {
  const raw = pick(sp, "page");
  const n = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export default async function PokemonCardsIndex({
  searchParams,
}: {
  searchParams?: SearchParamsLike;
}) {
  const perPage = readPerPage(searchParams);
  const page = readPage(searchParams);
  const q = (pick(searchParams, "q") ?? "").trim();
  const offset = (page - 1) * perPage;

  // Count
  const countRes = await db.execute(sql`
    SELECT COUNT(*)::int AS n
    FROM tcg_cards
    ${q ? sql`WHERE name ILIKE ${"%" + q + "%"}` : sql``}
  `);
  const total = (countRes.rows?.[0] as { n: number } | undefined)?.n ?? 0;

  // Page
  const rows = await db.execute(sql`
    SELECT
      id, name, set_id, set_name, small_image, large_image, rarity, release_date
    FROM tcg_cards
    ${q ? sql`WHERE name ILIKE ${"%" + q + "%"}` : sql``}
    ORDER BY release_date DESC NULLS LAST, name ASC
    LIMIT ${perPage} OFFSET ${offset}
  `);

  const cards =
    (rows.rows as Array<{
      id: string;
      name: string | null;
      set_id: string | null;
      set_name: string | null;
      small_image: string | null;
      large_image: string | null;
      rarity: string | null;
    }>) ?? [];

  const pageCount = Math.max(1, Math.ceil(total / perPage));

  return (
    <section className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/10 px-3 py-2 backdrop-blur">
        <h1 className="text-lg md:text-xl font-semibold text-white m-0">
          Pokémon Cards{q ? ` — “${q}”` : ""}
        </h1>

        <div className="flex items-center gap-4">
          <div className="text-sm text-white/70 shrink-0 whitespace-nowrap">
            Showing <span className="font-medium text-white">{Math.min(offset + 1, total)}</span>–
            <span className="font-medium text-white">{Math.min(offset + perPage, total)}</span> of{" "}
            <span className="font-medium text-white">{total}</span>
          </div>

          {/* Per-page dropdown (client) */}
          <PerPageSelect
            value={perPage}
            options={[24, 30, 48, 60, 96, 120]}
            className="shrink-0"
          />
        </div>
      </div>

      {/* Grid */}
      <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-4">
        {cards.map((c) => (
          <li key={c.id} className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
            <Link href={`/categories/pokemon/cards/${encodeURIComponent(c.id)}`} className="block">
              <div className="relative w-full" style={{ aspectRatio: "3 / 4" }}>
                <Image
                  src={c.small_image || c.large_image || "/placeholder.png"}
                  alt={c.name ?? "Card"}
                  fill
                  sizes="(max-width:768px) 50vw, (max-width:1200px) 25vw, 16vw"
                  className="object-contain"
                />
              </div>
              <div className="p-2">
                <div className="text-sm font-medium text-white line-clamp-2">{c.name ?? "Untitled"}</div>
                <div className="text-xs text-white/70">{(c.set_name ?? "").trim()}</div>
                {c.rarity && <div className="text-[11px] text-white/70">{c.rarity}</div>}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {/* Pager */}
      <div className="flex items-center justify-center gap-3 pt-2">
        {page > 1 && (
          <Link
            href={`?${new URLSearchParams({
              ...(q ? { q } : {}),
              perPage: String(perPage),
              page: String(page - 1),
            }).toString()}`}
            className="rounded border border-white/20 px-3 py-1.5 text-sm text-white hover:bg-white/10"
          >
            ← Prev
          </Link>
        )}
        <div className="text-sm text-white/80">
          Page <span className="font-medium text-white">{page}</span> /{" "}
          <span className="font-medium text-white">{pageCount}</span>
        </div>
        {page < pageCount && (
          <Link
            href={`?${new URLSearchParams({
              ...(q ? { q } : {}),
              perPage: String(perPage),
              page: String(page + 1),
            }).toString()}`}
            className="rounded border border-white/20 px-3 py-1.5 text-sm text-white hover:bg-white/10"
          >
            Next →
          </Link>
        )}
      </div>
    </section>
  );
}
