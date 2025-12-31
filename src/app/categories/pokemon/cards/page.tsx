// src/app/categories/pokemon/cards/page.tsx
import "server-only";

import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import PokemonCardsClient from "./PokemonCardsClient";
import type { Metadata } from "next";
import { site } from "@/config/site";

export const metadata: Metadata = {
  title: "Pokemon Cards | Legendary Collectibles",
  description: "Browse pokemon cards, prices, and collection tools.",
  alternates: { canonical: `${site.url}/categories/pokemon/cards` },
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ---------------- types ---------------- */
type CardListRow = {
  id: string;
  name: string | null;
  rarity: string | null;
  set_name: string | null;
  set_id: string | null;
  small_image: string | null;
  large_image: string | null;

  // variants (left joined)
  v_normal: boolean | null;
  v_reverse: boolean | null;
  v_holo: boolean | null;
  v_first_edition: boolean | null;
  v_w_promo: boolean | null;
};

type SearchParams = { q?: string; page?: string; perPage?: string };

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

function buildHref(base: string, qs: { q?: string | null; page?: number; perPage?: number }) {
  const p = new URLSearchParams();
  if (qs.q) p.set("q", qs.q);
  if (qs.perPage) p.set("perPage", String(qs.perPage));
  if (qs.page) p.set("page", String(qs.page));
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

/** Normalize variants to strict booleans so client chip logic is deterministic */
function normalizeVariants(row: Pick<
  CardListRow,
  "v_normal" | "v_reverse" | "v_holo" | "v_first_edition" | "v_w_promo"
>) {
  return {
    normal: row.v_normal === true,
    reverse: row.v_reverse === true,
    holo: row.v_holo === true,
    first_edition: row.v_first_edition === true,
    w_promo: row.v_w_promo === true,
  };
}

export default async function PokemonCardsIndex({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const baseHref = "/categories/pokemon/cards";

  const q: string | null = (sp?.q ?? "").trim() || null;
  const perPage: number = parsePerPage(sp?.perPage);
  const reqPage: number = parsePage(sp?.page);

  // Build WHERE
  const where = q
    ? sql`WHERE (
        c.name ILIKE ${"%" + q + "%"}
        OR c.rarity ILIKE ${"%" + q + "%"}
        OR c.id ILIKE ${"%" + q + "%"}
      )`
    : sql``;

  // Total count
  const total =
    (
      await db.execute<{ count: number }>(sql`
        SELECT COUNT(*)::int AS count
        FROM public.tcg_cards c
        ${where}
      `)
    ).rows?.[0]?.count ?? 0;

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(Math.max(1, reqPage), totalPages);
  const safeOffset = (safePage - 1) * perPage;

  const rows =
    (
      await db.execute<CardListRow>(sql`
        SELECT
          c.id,
          c.name,
          c.rarity,
          c.set_name,
          c.set_id,
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

        ${where}
        ORDER BY c.name ASC NULLS LAST, c.id ASC
        LIMIT ${perPage} OFFSET ${safeOffset}
      `)
    ).rows ?? [];

  const from = total === 0 ? 0 : safeOffset + 1;
  const to = Math.min(safeOffset + perPage, total);

  const cards = rows.map((c) => ({
    cardId: c.id,
    name: c.name ?? c.id,
    setName: c.set_name ?? c.set_id ?? null,
    imageUrl: c.large_image || c.small_image || null,
    variants: normalizeVariants(c),
  }));

  const prevPage = Math.max(1, safePage - 1);
  const nextPage = Math.min(totalPages, safePage + 1);
  const isFirst = safePage <= 1;
  const isLast = safePage >= totalPages;

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-white">
          <h1 className="text-2xl font-bold">Pokémon Cards</h1>
          <div className="text-sm text-white/80">
            Showing {from}-{to} of {total}
            {q ? " (filtered)" : ""} • Tap a variant chip to add that version
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <form action={baseHref} method="get" className="flex items-center gap-2">
            <input type="hidden" name="perPage" value={String(perPage)} />
            <input type="hidden" name="page" value="1" />
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search… (name/rarity/id)"
              className="w-60 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white placeholder:text-white/60 outline-none focus:ring-2 focus:ring-white/50 md:w-[320px]"
            />
            <button
              type="submit"
              className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20"
            >
              Search
            </button>

            {q ? (
              <Link
                href={buildHref(baseHref, { perPage, page: 1 })}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/15"
              >
                Clear
              </Link>
            ) : null}
          </form>

          {/* Per page */}
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

      {cards.length === 0 ? (
        <div className="rounded-xl border border-white/15 bg-white/5 p-6 text-white/90 backdrop-blur-sm">
          {q ? "No cards matched your search." : "No cards to display."}
        </div>
      ) : (
        <PokemonCardsClient cards={cards} />
      )}

      {total > perPage ? (
        <nav className="mt-4 flex items-center justify-center gap-2 text-sm">
          <Link
            href={buildHref(baseHref, { q, perPage, page: prevPage })}
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
            Page {safePage} of {totalPages}
          </span>

          <Link
            href={buildHref(baseHref, { q, perPage, page: nextPage })}
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
      ) : null}
    </section>
  );
}
