// src/app/categories/yugioh/sets/[id]/page.tsx
import "server-only";

import Link from "next/link";
import Script from "next/script";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import YgoCardsClient from "../../cards/YgoCardsClient";
import { site } from "@/config/site";
import { absUrl } from "@/lib/urls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = {
  card_id: string;
  name: string;
  thumb: string | null;
};

type CountRow = { count: string };

const DEFAULT_PER = 36;
const MAX_PER = 96;

function toInt(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function getStr(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0] ?? null;
  return null;
}

function httpsify(u?: string | null) {
  if (!u) return null;
  return u.replace(/^http:\/\//i, "https://");
}

/**
 * ✅ Canonical-clean query builder:
 * - omits page when 1
 * - omits per when DEFAULT_PER
 * - omits q when empty
 */
function qs(next: { q?: string | null; per?: number; page?: number }) {
  const params = new URLSearchParams();

  const q = (next.q ?? "").trim();
  const per = next.per ?? DEFAULT_PER;
  const page = next.page ?? 1;

  if (q) params.set("q", q);
  if (per !== DEFAULT_PER) params.set("per", String(per));
  if (page > 1) params.set("page", String(page));

  const s = params.toString();
  return s ? `?${s}` : "";
}

async function fetchSetCards(opts: { setName: string; q: string | null; page: number; per: number }) {
  const { setName, q, page, per } = opts;
  const offset = (page - 1) * per;

  const filters = [sql`cs.set_name = ${setName}`];

  if (q) {
    // if q matches exact id, great; otherwise name contains
    filters.push(sql`(lower(c.card_id) = lower(${q}) OR c.name ILIKE '%' || ${q} || '%')`);
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

/* ---------------- Metadata ---------------- */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, unknown>>;
}): Promise<Metadata> {
  const p = await params;
  const sp = await searchParams;

  const setName = decodeURIComponent(String(p.id ?? "")).trim();
  if (!setName) {
    const canonical = absUrl("/categories/yugioh/sets");
    return {
      title: `Yu-Gi-Oh! Sets | ${site.name}`,
      description: "Browse Yu-Gi-Oh! sets.",
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
  }

  const qRaw = getStr(sp.q);
  const q = qRaw ? qRaw.trim() : null;

  const per = Math.min(MAX_PER, toInt(sp.per, DEFAULT_PER));
  const page = Math.max(1, toInt(sp.page, 1));

  const basePath = `/categories/yugioh/sets/${encodeURIComponent(setName)}`;
  const canonical = absUrl(`${basePath}${qs({ q, per, page })}`);

  const titleBase = `${setName} • Yu-Gi-Oh! Set | ${site.name ?? "Legendary Collectibles"}`;
  const title = page > 1 ? `${titleBase} • Page ${page}` : titleBase;

  const desc = q
    ? `Browse Yu-Gi-Oh! cards in ${setName}. Filtered by “${q}”.`
    : `Browse Yu-Gi-Oh! cards in ${setName}.`;

  return {
    title,
    description: desc,
    alternates: { canonical },
    robots: { index: true, follow: true },
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

/* ---------------- Page ---------------- */
export default async function YugiohSetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, unknown>>;
}) {
  const p = await params;
  const sp = await searchParams;

  const setName = decodeURIComponent(String(p.id ?? "")).trim();

  if (!setName) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold text-white">Set not found</h1>
        <Link href="/categories/yugioh/sets" className="text-sky-300 hover:underline">
          ← Back to sets
        </Link>
      </section>
    );
  }

  const qRaw = getStr(sp.q);
  const q = qRaw ? qRaw.trim() : null;

  const requestedPer = Math.min(MAX_PER, toInt(sp.per, DEFAULT_PER));
  const requestedPage = Math.max(1, toInt(sp.page, 1));

  const { rows, total } = await fetchSetCards({
    setName,
    q,
    page: requestedPage,
    per: requestedPer,
  });

  const pages = Math.max(1, Math.ceil(total / requestedPer));
  const safePage = Math.min(pages, requestedPage);

  // ✅ Canonical redirect if page out of range OR default params should be dropped
  const basePath = `/categories/yugioh/sets/${encodeURIComponent(setName)}`;
  const canonicalRel = `${basePath}${qs({ q, per: requestedPer, page: safePage })}`;

  const explicitDefaultParams =
    (sp.page !== undefined && safePage === 1) ||
    (sp.per !== undefined && requestedPer === DEFAULT_PER);

  const needsClampRedirect = safePage !== requestedPage;

  if (needsClampRedirect || explicitDefaultParams) {
    redirect(canonicalRel);
  }

  const offset = (safePage - 1) * requestedPer;
  const showingFrom = total ? offset + 1 : 0;
  const showingTo = Math.min(total, safePage * requestedPer);

  const cardsForClient = rows.map((r) => ({
    cardId: r.card_id,
    name: r.name,
    setName: setName,
    imageUrl: r.thumb ?? null,
  }));

  // ---- JSON-LD ----
  const canonicalUrl = absUrl(`${basePath}${qs({ q, per: requestedPer, page: safePage })}`);

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absUrl("/") },
      { "@type": "ListItem", position: 2, name: "Categories", item: absUrl("/categories") },
      { "@type": "ListItem", position: 3, name: "Yu-Gi-Oh!", item: absUrl("/categories/yugioh/sets") },
      { "@type": "ListItem", position: 4, name: setName, item: canonicalUrl },
    ],
  };

  const listItems = rows.map((r, i) => ({
    "@type": "ListItem",
    position: offset + i + 1,
    url: absUrl(`/categories/yugioh/cards/${encodeURIComponent(r.card_id)}`),
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
          {/* keep per, always reset page to 1 on new search */}
          {requestedPer !== DEFAULT_PER ? (
            <input type="hidden" name="per" value={String(requestedPer)} />
          ) : null}
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
              href={`${basePath}${qs({ per: requestedPer, page: 1 })}`}
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
                  href={`${basePath}${qs({ q: q ?? null, page: safePage - 1, per: requestedPer })}`}
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
                  href={`${basePath}${qs({ q: q ?? null, page: safePage + 1, per: requestedPer })}`}
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
