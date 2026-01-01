// src/app/categories/yugioh/cards/page.tsx
import "server-only";

import Link from "next/link";
import Script from "next/script";
import type { Metadata } from "next";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

import YgoCardSearch from "@/components/ygo/YgoCardSearch";
import YgoCardsClient from "./YgoCardsClient";
import { site } from "@/config/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ---------------- Types ---------------- */
type ListRow = {
  id: string; // ygo_cards.card_id
  name: string;
  type: string | null;
  attribute: string | null;
  race: string | null;
  thumb: string | null;
  set_name: string | null;
};

type CountRow = { count: string };

/* ---------------- URL / SEO helpers ---------------- */
function absBase() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
    site?.url ||
    "https://legendary-collectibles.com"
  );
}

function absUrl(path: string) {
  const base = absBase().replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

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

/* ---------------- Dynamic metadata (maxed) ---------------- */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, unknown>>;
}): Promise<Metadata> {
  const sp = await searchParams;

  const q = (getStr(sp.q) ?? "").trim();
  const page = Math.max(1, toInt(sp.page, 1));

  const canonical = absUrl("/categories/yugioh/cards");

  const title =
    q
      ? `Yu-Gi-Oh! Cards matching “${q}” | ${site.name}`
      : page > 1
        ? `Yu-Gi-Oh! Cards (Page ${page}) | ${site.name}`
        : `Yu-Gi-Oh! Cards | ${site.name}`;

  const description =
    "Browse Yu-Gi-Oh! cards across classic and modern eras. Search by name or Card ID, explore images and set appearances, and manage your collection on Legendary Collectibles.";

  const og =
    site?.ogImage
      ? site.ogImage.startsWith("http")
        ? site.ogImage
        : absUrl(site.ogImage)
      : absUrl("/og-image.png");

  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      url: canonical,
      siteName: site.name,
      title,
      description,
      images: [{ url: og }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [og],
    },
  };
}

/* ---------------- Data ---------------- */
async function fetchCards(opts: { q: string | null; page: number; per: number }) {
  const { q, page, per } = opts;
  const offset = (page - 1) * per;

  if (q) {
    const countRes = await db.execute<CountRow>(sql`
      SELECT COUNT(*)::bigint::text AS count
      FROM ygo_cards c
      WHERE c.card_id = ${q} OR c.name ILIKE '%' || ${q} || '%'
    `);
    const total = Number(countRes.rows?.[0]?.count ?? "0");

    const listRes = await db.execute<ListRow>(sql`
      SELECT
        c.card_id AS id,
        c.name,
        c.type,
        c.attribute,
        c.race,
        img.thumb,
        sets.set_name
      FROM ygo_cards c
      LEFT JOIN LATERAL (
        SELECT i.image_url_small AS thumb
        FROM ygo_card_images i
        WHERE i.card_id = c.card_id
        ORDER BY (CASE WHEN i.image_url_small IS NOT NULL THEN 0 ELSE 1 END)
        LIMIT 1
      ) img ON TRUE
      LEFT JOIN LATERAL (
        SELECT MIN(cs.set_name)::text AS set_name
        FROM ygo_card_sets cs
        WHERE cs.card_id = c.card_id
      ) sets ON TRUE
      WHERE c.card_id = ${q} OR c.name ILIKE '%' || ${q} || '%'
      ORDER BY
        CASE
          WHEN LOWER(c.name) = LOWER(${q}) THEN 0
          WHEN LOWER(c.name) LIKE LOWER(${q}) || '%' THEN 1
          ELSE 2
        END,
        c.name ASC
      LIMIT ${per} OFFSET ${offset}
    `);

    return { rows: (listRes.rows ?? []) as ListRow[], total };
  }

  const countRes = await db.execute<CountRow>(sql`
    SELECT COUNT(*)::bigint::text AS count
    FROM ygo_cards
  `);
  const total = Number(countRes.rows?.[0]?.count ?? "0");

  const listRes = await db.execute<ListRow>(sql`
    SELECT
      c.card_id AS id,
      c.name,
      c.type,
      c.attribute,
      c.race,
      img.thumb,
      sets.set_name
    FROM ygo_cards c
    LEFT JOIN LATERAL (
      SELECT i.image_url_small AS thumb
      FROM ygo_card_images i
      WHERE i.card_id = c.card_id
      ORDER BY (CASE WHEN i.image_url_small IS NOT NULL THEN 0 ELSE 1 END)
      LIMIT 1
    ) img ON TRUE
    LEFT JOIN LATERAL (
      SELECT MIN(cs.set_name)::text AS set_name
      FROM ygo_card_sets cs
      WHERE cs.card_id = c.card_id
    ) sets ON TRUE
    ORDER BY c.name ASC
    LIMIT ${per} OFFSET ${offset}
  `);

  return { rows: (listRes.rows ?? []) as ListRow[], total };
}

/* ---------------- Page ---------------- */
export default async function YugiohCardsIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, unknown>>;
}) {
  const sp = await searchParams;
  const qRaw = getStr(sp.q);
  const q = qRaw ? qRaw.trim() : null;

  const per = Math.min(96, toInt(sp.per, 36));
  const page = Math.max(1, toInt(sp.page, 1));

  const { rows, total } = await fetchCards({ q, page, per });
  const pages = Math.max(1, Math.ceil(total / per));
  const safePage = Math.min(page, pages);

  const showingFrom = total ? (safePage - 1) * per + 1 : 0;
  const showingTo = Math.min(total, safePage * per);
  const basePath = "/categories/yugioh/cards";

  const canonical = absUrl(basePath);

  // JSON-LD: Breadcrumbs + CollectionPage ItemList
  const breadcrumbsJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absUrl("/") },
      { "@type": "ListItem", position: 2, name: "Categories", item: absUrl("/categories") },
      { "@type": "ListItem", position: 3, name: "Yu-Gi-Oh!", item: absUrl("/categories/yugioh/cards") },
      { "@type": "ListItem", position: 4, name: "Cards", item: canonical },
    ],
  };

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Yu-Gi-Oh! Cards",
    url: canonical,
    description:
      "Browse Yu-Gi-Oh! cards across classic and modern eras. Search by name or Card ID, explore images and sets, and manage your collection.",
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: total,
      itemListElement: rows.map((r, idx) => ({
        "@type": "ListItem",
        position: (safePage - 1) * per + idx + 1,
        name: r.name,
        url: absUrl(`/categories/yugioh/cards/${encodeURIComponent(r.id)}`),
      })),
    },
  };

  // ✅ Only pass what YgoCardsClient already expects: { cards }
  const cardsForClient = rows.map((r) => ({
    cardId: r.id,
    name: r.name,
    setName: r.set_name ?? null,
    imageUrl: r.thumb ?? null,
  }));

  return (
    <section className="space-y-6">
      {/* JSON-LD */}
      <Script
        id="ygo-cards-breadcrumbs-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbsJsonLd) }}
      />
      <Script
        id="ygo-cards-collectionpage-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />

      {/* Visible breadcrumbs */}
      <nav className="text-xs text-white/70">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/" className="hover:underline">Home</Link>
          <span className="text-white/40">/</span>
          <Link href="/categories" className="hover:underline">Categories</Link>
          <span className="text-white/40">/</span>
          <Link href="/categories/yugioh/cards" className="hover:underline">Yu-Gi-Oh!</Link>
          <span className="text-white/40">/</span>
          <span className="text-white/90">Cards</span>
        </div>
      </nav>

      {/* SEO intro */}
      <div className="max-w-3xl space-y-3 text-sm text-white/80">
        <p>
          Browse Yu-Gi-Oh! cards across classic eras and modern sets, including popular archetypes,
          staples, and collector favorites. Use search to quickly find cards by name or exact Card ID.
        </p>
        <p>
          Legendary Collectibles helps you explore images and set appearances, track market movement,
          and organize your collection over time as our database expands.
        </p>
      </div>

      {/* Search */}
      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <div className="mb-2 text-sm font-semibold text-white">Search Yu-Gi-Oh! cards</div>
        <YgoCardSearch initialQuery={q ?? ""} />
        <div className="mt-2 text-xs text-white/60">Tip: type a name or an exact Card ID.</div>
      </div>

      {/* Header + meta */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">Yu-Gi-Oh! Cards</h1>
        <div className="text-sm text-white/70">
          {q ? (
            <>
              Showing <span className="text-white">{showingFrom}</span>–
              <span className="text-white">{showingTo}</span> of{" "}
              <span className="text-white">{total.toLocaleString()}</span> results for{" "}
              <span className="text-white">“{q}”</span>
            </>
          ) : (
            <>
              Showing <span className="text-white">{showingFrom}</span>–
              <span className="text-white">{showingTo}</span> of{" "}
              <span className="text-white">{total.toLocaleString()}</span> cards
            </>
          )}
        </div>
      </div>

      {/* Empty state / Grid */}
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-white/15 bg-white/5 p-6 text-white/80">
          No cards found{q ? <> for “{q}”</> : null}.
        </div>
      ) : (
        <>
          <YgoCardsClient cards={cardsForClient} />

          {/* Pagination */}
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
