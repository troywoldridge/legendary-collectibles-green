// src/app/categories/yugioh/sets/[id]/page.tsx
import "server-only";

import Link from "next/link";
import Script from "next/script";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import YgoCardsClient from "../../cards/YgoCardsClient";
import type { Metadata } from "next";
import { site } from "@/config/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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

function qs(next: Record<string, string | number | undefined | null>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) {
    if (v === undefined || v === null || v === "") continue;
    // don't include page=1
    if (k === "page" && String(v) === "1") continue;
    params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

function httpsify(u?: string | null) {
  if (!u) return null;
  return u.replace(/^http:\/\//i, "https://");
}

async function fetchSetCards(opts: { setName: string; q: string | null; page: number; per: number }) {
  const { setName, q, page, per } = opts;
  const offset = (page - 1) * per;

  const filters = [sql`cs.set_name = ${setName}`];
  if (q) {
    filters.push(sql`(c.card_id = ${q} OR c.name ILIKE '%' || ${q} || '%')`);
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

export async function generateMetadata(
  { params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, unknown>> },
): Promise<Metadata> {
  const p = await params;
  const sp = await searchParams;

  const setName = decodeURIComponent(p.id ?? "").trim();
  const qRaw = getStr(sp.q);
  const q = qRaw ? qRaw.trim() : null;

  const per = Math.min(96, toInt(sp.per, 36));
  const page = Math.max(1, toInt(sp.page, 1));

  const basePath = `/categories/yugioh/sets/${encodeURIComponent(setName)}`;
  const canonical = `${site.url}${basePath}${qs({ q, per, page })}`;

  const titleBase = `${setName} • Yu-Gi-Oh! Set | Legendary Collectibles`;
  const title = page > 1 ? `${titleBase} • Page ${page}` : titleBase;

  const desc = q
    ? `Browse Yu-Gi-Oh! cards in ${setName}. Filtered by “${q}”.`
    : `Browse Yu-Gi-Oh! cards in ${setName}.`;

  return {
    title,
    description: desc,
    alternates: { canonical },
    openGraph: {
      title,
      description: desc,
      url: canonical,
      siteName: site.name ?? "Legendary Collectibles",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: desc,
    },
  };
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

  const setName = decodeURIComponent(p.id ?? "").trim();

  const qRaw = getStr(sp.q);
  const q = qRaw ? qRaw.trim() : null;

  const per = Math.min(96, toInt(sp.per, 36));
  const page = Math.max(1, toInt(sp.page, 1));

  const { rows, total } = await fetchSetCards({ setName, q, page, per });

  const pages = Math.max(1, Math.ceil(total / per));
  const safePage = Math.min(pages, page);
  const offset = (safePage - 1) * per;

  const showingFrom = total ? offset + 1 : 0;
  const showingTo = Math.min(total, safePage * per);

  const basePath = `/categories/yugioh/sets/${encodeURIComponent(setName)}`;

  const cardsForClient = rows.map((r) => ({
    cardId: r.card_id,
    name: r.name,
    setName: setName,
    imageUrl: r.thumb ?? null,
  }));

  // ---- JSON-LD ----
  const canonicalUrl = `${site.url}${basePath}${qs({ q, per, page: safePage })}`;

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Categories", item: `${site.url}/categories` },
      { "@type": "ListItem", position: 2, name: "Yu-Gi-Oh!", item: `${site.url}/categories/yugioh/sets` },
      { "@type": "ListItem", position: 3, name: setName, item: canonicalUrl },
    ],
  };

  const listItems = rows.map((r, i) => ({
    "@type": "ListItem",
    position: offset + i + 1,
    url: `${site.url}/categories/yugioh/cards/${encodeURIComponent(r.card_id)}`,
    name: r.name,
    image: httpsify(r.thumb) ?? undefined,
  }));

  const collectionLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${setName} • Yu-Gi-Oh! Set`,
    description: q
      ? `Browse Yu-Gi-Oh! cards in ${setName}. Filtered by “${q}”.`
      : `Browse Yu-Gi-Oh! cards in ${setName}.`,
    url: canonicalUrl,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: total,
      itemListOrder: "https://schema.org/ItemListOrderAscending",
      itemListElement: listItems,
    },
  };

  return (
    <section className="space-y-6">
      <Script
        id="ld-json-ygo-set-breadcrumb"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <Script
        id="ld-json-ygo-set-collection"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionLd) }}
      />

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
          <YgoCardsClient cards={cardsForClient} />

          <nav className="mt-4 flex items-center justify-between gap-2">
            <div>
              {safePage > 1 ? (
                <Link
                  href={`${basePath}${qs({ q: q ?? undefined, page: safePage - 1, per })}`}
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
              Page <span className="text-white">{safePage}</span> of{" "}
              <span className="text-white">{pages}</span>
            </div>

            <div>
              {safePage < pages ? (
                <Link
                  href={`${basePath}${qs({ q: q ?? undefined, page: safePage + 1, per })}`}
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
