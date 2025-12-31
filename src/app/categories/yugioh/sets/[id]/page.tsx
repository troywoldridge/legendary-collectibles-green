// src/app/categories/yugioh/sets/[id]/page.tsx
import "server-only";

import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

import YgoCardsClient from "../../cards/YgoCardsClient";

import type { Metadata } from "next";
import { site } from "@/config/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;
  const safeId = encodeURIComponent(id);

  return {
    alternates: {
      canonical: `${site.url}/categories/yugioh/cards/${safeId}`,
    },
  };
}


type Row = {
  card_id: string;
  name: string;
  thumb: string | null;
};

type CountRow = { count: string };

function toInt(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function getStr(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0] ?? null;
  return null;
}

function qs(next: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) {
    if (v === undefined || v === null || v === "") continue;
    params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

async function fetchSetCards(opts: {
  setName: string;
  q: string | null;
  page: number;
  per: number;
}) {
  const { setName, q, page, per } = opts;
  const offset = (page - 1) * per;

  const filters = [sql`cs.set_name = ${setName}`];
  if (q) {
    filters.push(
      sql`(c.card_id = ${q} OR c.name ILIKE '%' || ${q} || '%')`,
    );
  }
  const where = sql.join(filters, sql` AND `);

  const countRes = await db.execute<CountRow>(sql`
    SELECT COUNT(DISTINCT cs.card_id)::bigint::text AS count
    FROM ygo_card_sets cs
    JOIN ygo_cards c ON c.card_id = cs.card_id
    WHERE ${where}
  `);
  const total = Number(countRes.rows?.[0]?.count ?? "0");

  const listRes = await db.execute<Row>(sql`
    SELECT
      c.card_id,
      c.name,
      img.thumb
    FROM ygo_card_sets cs
    JOIN ygo_cards c ON c.card_id = cs.card_id
    LEFT JOIN LATERAL (
      SELECT i.image_url_small AS thumb
      FROM ygo_card_images i
      WHERE i.card_id = c.card_id
      ORDER BY (CASE WHEN i.image_url_small IS NOT NULL THEN 0 ELSE 1 END)
      LIMIT 1
    ) img ON TRUE
    WHERE ${where}
    GROUP BY c.card_id, c.name, img.thumb
    ORDER BY c.name ASC
    LIMIT ${per} OFFSET ${offset}
  `);

  return { rows: (listRes.rows ?? []) as Row[], total };
}

export default async function YugiohSetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, unknown>>;
}) {
  const p = await params;
  const sp = await searchParams;

  // route param is encoded set name
  const setName = decodeURIComponent(p.id ?? "").trim();

  const qRaw = getStr(sp.q);
  const q = qRaw ? qRaw.trim() : null;

  const per = Math.min(96, toInt(sp.per, 36));
  const page = Math.max(1, toInt(sp.page, 1));

  const { rows, total } = await fetchSetCards({ setName, q, page, per });

  const pages = Math.max(1, Math.ceil(total / per));
  const showingFrom = total ? (page - 1) * per + 1 : 0;
  const showingTo = Math.min(total, page * per);

  const basePath = `/categories/yugioh/sets/${encodeURIComponent(setName)}`;

  // feed client component so it can render AddToCollection + status
  const cardsForClient = rows.map((r) => ({
    cardId: r.card_id,
    name: r.name,
    setName: setName,
    imageUrl: r.thumb ?? null,
  }));

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-white">{setName}</h1>
          <div className="text-sm text-white/70">
            Yu-Gi-Oh! Set •{" "}
            {q ? (
              <>
                Showing <span className="text-white">{showingFrom}</span>–
                <span className="text-white">{showingTo}</span> of{" "}
                <span className="text-white">{total.toLocaleString()}</span>{" "}
                matches for <span className="text-white">“{q}”</span>
              </>
            ) : (
              <>
                Showing <span className="text-white">{showingFrom}</span>–
                <span className="text-white">{showingTo}</span> of{" "}
                <span className="text-white">{total.toLocaleString()}</span>{" "}
                cards
              </>
            )}
          </div>
        </div>

        {/* Search within set */}
        <form action={basePath} method="get" className="flex items-center gap-2">
          <input type="hidden" name="per" value={String(per)} />
          <input type="hidden" name="page" value="1" />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search this set (name/id)…"
            className="w-64 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white placeholder:text-white/60 outline-none focus:ring-2 focus:ring-white/50"
          />
          <button className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20">
            Search
          </button>
          {q ? (
            <Link
              href={`${basePath}${qs({ per, page: 1 })}`}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/15"
            >
              Clear
            </Link>
          ) : null}
        </form>
      </div>

      {/* Empty */}
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-white/15 bg-white/5 p-6 text-white/80">
          No cards found{q ? <> for “{q}”</> : null}.
        </div>
      ) : (
        <>
          {/* ✅ Client list with Add to collection */}
          <YgoCardsClient cards={cardsForClient} />

          {/* Pagination */}
          <nav className="mt-4 flex items-center justify-between gap-2">
            <div>
              {page > 1 ? (
                <Link
                  href={`${basePath}${qs({
                    q: q ?? undefined,
                    page: page - 1,
                    per,
                  })}`}
                  className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-sky-300 hover:border-white/25 hover:bg-white/10"
                >
                  ← Prev
                </Link>
              ) : (
                <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/40">
                  ← Prev
                </span>
              )}
            </div>

            <div className="text-sm text-white/70">
              Page <span className="text-white">{page}</span> of{" "}
              <span className="text-white">{pages}</span>
            </div>

            <div>
              {page < pages ? (
                <Link
                  href={`${basePath}${qs({
                    q: q ?? undefined,
                    page: page + 1,
                    per,
                  })}`}
                  className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-sky-300 hover:border-white/25 hover:bg-white/10"
                >
                  Next →
                </Link>
              ) : (
                <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/40">
                  Next →
                </span>
              )}
            </div>
          </nav>
        </>
      )}
    </section>
  );
}
