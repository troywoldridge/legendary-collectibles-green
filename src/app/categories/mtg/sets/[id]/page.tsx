/* eslint-disable @typescript-eslint/no-unused-vars */
import "server-only";

import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import CardGridTile from "@/components/CardGridTile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Pokémon Card Prices, Collection Tracking & Shop | Legendary Collectibles",
  description:
    "Browse Pokémon cards, track prices, manage your collection, and buy singles and sealed products online.",
};


type SearchParams = Record<string, string | string[] | undefined>;

type SetRow = {
  code: string;
  name: string | null;
  set_type: string | null;
  block: string | null;
  released_at: string | null; // yyyy-mm-dd
};

type CardThumb = {
  id: string;
  name: string | null;
  number: string | null;
  image_url: string | null;
  rarity: string | null;
  price_usd: string | null;
  price_updated: string | null;
};

const PER_PAGE_OPTIONS = [30, 60, 120] as const;

function firstVal(v?: string | string[]) {
  return Array.isArray(v) ? v[0] : v;
}

function parsePerPage(v?: string | string[]) {
  const n = Number(firstVal(v) ?? 60);
  return (PER_PAGE_OPTIONS as readonly number[]).includes(n) ? n : 60;
}

function parsePage(v?: string | string[]) {
  const n = Number(firstVal(v) ?? 1);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

function buildHref(base: string, qs: { page?: number; perPage?: number }) {
  const p = new URLSearchParams();
  if (qs.page) p.set("page", String(qs.page));
  if (qs.perPage) p.set("perPage", String(qs.perPage));
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

export default async function MtgSetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id: rawId } = await params;
  const sp = await searchParams;

  const id = decodeURIComponent(String(rawId ?? "")).trim();
  if (!id) notFound();

  const perPage = parsePerPage(sp?.perPage);
  const reqPage = parsePage(sp?.page);

  const setRes = await db.execute<SetRow>(sql`
    SELECT
      code,
      name,
      set_type,
      block,
      COALESCE(TO_CHAR(released_at,'YYYY-MM-DD'), NULL) AS released_at
    FROM public.scryfall_sets
    WHERE LOWER(code) = LOWER(${id})
    LIMIT 1
  `);

  const s = setRes.rows?.[0] ?? null;
  if (!s) notFound();

  const totalRes = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*)::text AS count
    FROM public.scryfall_cards_raw c
    WHERE LOWER(c.set_code) = LOWER(${s.code})
  `);

  const total = Number(totalRes.rows?.[0]?.count ?? "0");
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.max(1, Math.min(totalPages, reqPage));
  const offset = (page - 1) * perPage;

  const cardsRes = await db.execute<CardThumb>(sql`
    SELECT
      c.id::text AS id,
      c.name,
      c.collector_number AS number,
      (c.payload->>'rarity') AS rarity,
      COALESCE(
        (c.payload->'image_uris'->>'normal'),
        (c.payload->'image_uris'->>'large'),
        (c.payload->'image_uris'->>'small'),
        (c.payload->'card_faces'->0->'image_uris'->>'normal'),
        (c.payload->'card_faces'->0->'image_uris'->>'large'),
        (c.payload->'card_faces'->0->'image_uris'->>'small')
      ) AS image_url,

      COALESCE(e.effective_usd, sl.usd)::text AS price_usd,
      COALESCE(
        TO_CHAR(e.effective_updated_at, 'YYYY-MM-DD'),
        TO_CHAR(sl.updated_at, 'YYYY-MM-DD')
      ) AS price_updated

    FROM public.scryfall_cards_raw c
    LEFT JOIN public.mtg_prices_effective e
      ON e.scryfall_id = c.id
    LEFT JOIN public.mtg_prices_scryfall_latest sl
      ON sl.scryfall_id = c.id

    WHERE LOWER(c.set_code) = LOWER(${s.code})
    ORDER BY
      (CASE WHEN c.collector_number ~ '^[0-9]+$' THEN 0 ELSE 1 END),
      c.collector_number::text,
      c.name ASC
    LIMIT ${perPage} OFFSET ${offset}
  `);

  const baseHref = `/categories/mtg/sets/${encodeURIComponent(s.code)}`;

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{s.name ?? s.code}</h1>
          <div className="text-sm text-white/70">
            {[
              s.code,
              s.set_type ?? undefined,
              s.block ? `Block: ${s.block}` : undefined,
              s.released_at ? `Released: ${s.released_at}` : undefined,
            ]
              .filter(Boolean)
              .join(" • ")}
          </div>
        </div>

        <Link href="/categories/mtg/sets" className="text-sky-300 hover:underline">
          ← All MTG sets
        </Link>
      </div>

      {total === 0 ? (
        <div className="rounded-xl border border-white/15 bg-white/5 p-6 text-white/90">
          No cards in this set yet.
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {(cardsRes.rows ?? []).map((c) => {
              const img = (c.image_url ?? "").replace(/^http:\/\//, "https://") || null;
              const href = `/categories/mtg/cards/${encodeURIComponent(c.id)}`;

              return (
                <CardGridTile
                  key={c.id}
                  href={href}
                  imageUrl={img}
                  title={c.name ?? c.id}
                  subtitleLeft={[c.rarity ?? "", c.number ?? ""].filter(Boolean).join(" • ") || null}
                  extra={
                    <div className="text-xs text-white/60">
                      {c.price_usd ? `$${c.price_usd}` : "—"}
                      {c.price_updated ? ` • ${c.price_updated}` : ""}
                    </div>
                  }
                  cta={{
                    game: "Magic The Gathering",
                    card: {
                      id: c.id,
                      name: c.name ?? "",
                      number: c.number ?? undefined,
                      set_code: s.code,
                      set_name: s.name ?? undefined,
                    },
                  }}
                />
              );
            })}
          </ul>

          {total > perPage && (
            <nav className="mt-4 flex items-center justify-center gap-2 text-sm">
              <Link
                href={buildHref(baseHref, { perPage, page: Math.max(1, page - 1) })}
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
                href={buildHref(baseHref, { perPage, page: Math.min(totalPages, page + 1) })}
                aria-disabled={page >= totalPages}
                className={`rounded-md border px-3 py-1 ${
                  page >= totalPages
                    ? "pointer-events-none border-white/10 text-white/40"
                    : "border-white/20 text-white hover:bg-white/10"
                }`}
              >
                Next →
              </Link>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
