// src/app/categories/yugioh/sets/[id]/prices/page.tsx
import "server-only";

import type { Metadata } from "next";
import Script from "next/script";
import Link from "next/link";
import Image from "next/image";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { site } from "@/config/site";
import { CF_ACCOUNT_HASH } from "@/lib/cf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Record<string, string | string[] | undefined>;
type Currency = "USD" | "EUR";

type SetHeaderRow = {
  set_code: string;
  set_name: string | null;
};

type PriceAggRow = {
  cards_in_set: number;

  avg_tcgplayer: string | null;
  min_tcgplayer: string | null;
  max_tcgplayer: string | null;

  avg_cardmarket: string | null;
  min_cardmarket: string | null;
  max_cardmarket: string | null;

  avg_ebay: string | null;
  min_ebay: string | null;
  max_ebay: string | null;

  avg_amazon: string | null;
  min_amazon: string | null;
  max_amazon: string | null;

  avg_coolstuffinc: string | null;
  min_coolstuffinc: string | null;
  max_coolstuffinc: string | null;
};

/* ---------- Constants & helpers ---------- */
const CATEGORY = {
  label: "Yu-Gi-Oh!",
  categoriesHref: "/categories",
  setsHref: "/categories/yugioh/sets",
  // fallback banner (Cloudflare Images) if you don’t have per-set artwork yet
  bannerCfId: "87101a20-6ada-4b66-0057-2d210feb9d00",
};

const cfImageUrl = (id: string, variant = "categoryThumb") =>
  `https://imagedelivery.net/${CF_ACCOUNT_HASH}/${id}/${variant}`;

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

function readCurrency(sp: SearchParams): Currency {
  const raw = (Array.isArray(sp?.currency) ? sp.currency[0] : sp?.currency)?.toUpperCase();
  return raw === "EUR" ? "EUR" : "USD";
}

function withParam(baseHref: string, key: string, val: string) {
  const u = new URL(baseHref, "https://x/");
  u.searchParams.set(key, val);
  return u.pathname + (u.search ? u.search : "");
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function fmtMoney(v: unknown, currency: Currency) {
  const n = toNum(v);
  if (n == null || n <= 0) return "—";
  const sym = currency === "EUR" ? "€" : "$";
  return `${sym}${n.toFixed(2)}`;
}

/* ---------- Data ---------- */
async function getSetHeaderByCode(setCode: string): Promise<SetHeaderRow | null> {
  // set_code is NOT NULL and is the stable identifier
  const row =
    (
      await db.execute<SetHeaderRow>(sql`
        SELECT
          ${setCode}::text AS set_code,
          MIN(s.set_name)::text AS set_name
        FROM public.ygo_card_sets s
        WHERE s.set_code = ${setCode}
      `)
    ).rows?.[0] ?? null;

  // If set_code doesn’t exist, cards_in_set will be 0 in agg; header query will still return set_code.
  // So we need a real existence check:
  const exists =
    (
      await db.execute<{ ok: number }>(sql`
        SELECT 1::int AS ok
        FROM public.ygo_card_sets s
        WHERE s.set_code = ${setCode}
        LIMIT 1
      `)
    ).rows?.[0]?.ok ?? 0;

  return exists ? row : null;
}

async function getPriceSummaryBySetCode(setCode: string): Promise<PriceAggRow | null> {
  const row =
    (
      await db.execute<PriceAggRow>(sql`
        SELECT
          COUNT(DISTINCT s.card_id)::int AS cards_in_set,

          AVG(p.tcgplayer_price)::text  AS avg_tcgplayer,
          MIN(p.tcgplayer_price)::text  AS min_tcgplayer,
          MAX(p.tcgplayer_price)::text  AS max_tcgplayer,

          AVG(p.cardmarket_price)::text AS avg_cardmarket,
          MIN(p.cardmarket_price)::text AS min_cardmarket,
          MAX(p.cardmarket_price)::text AS max_cardmarket,

          AVG(p.ebay_price)::text       AS avg_ebay,
          MIN(p.ebay_price)::text       AS min_ebay,
          MAX(p.ebay_price)::text       AS max_ebay,

          AVG(p.amazon_price)::text     AS avg_amazon,
          MIN(p.amazon_price)::text     AS min_amazon,
          MAX(p.amazon_price)::text     AS max_amazon,

          AVG(p.coolstuffinc_price)::text AS avg_coolstuffinc,
          MIN(p.coolstuffinc_price)::text AS min_coolstuffinc,
          MAX(p.coolstuffinc_price)::text AS max_coolstuffinc

        FROM public.ygo_card_sets s
        LEFT JOIN public.ygo_card_prices p
          ON p.card_id = s.card_id
        WHERE s.set_code = ${setCode}
      `)
    ).rows?.[0] ?? null;

  return row ?? null;
}

/* ---------- SEO: Dynamic metadata ---------- */
export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const setCode = decodeURIComponent(params.id ?? "").trim();

  const canonical = absUrl(
    `/categories/yugioh/sets/${encodeURIComponent(setCode)}/prices`,
  );

  const header = await getSetHeaderByCode(setCode);
  if (!header) {
    return {
      title: `Yu-Gi-Oh! Set Not Found | ${site.name}`,
      description: "We couldn’t find that Yu-Gi-Oh! set. Browse sets and try again.",
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
  }

  const setName = header.set_name?.trim() || setCode;

  const title = `${setName} (${setCode}) — Yu-Gi-Oh! Set Prices | ${site.name}`;
  const description = `Average market prices for ${setName} (${setCode}) across TCGplayer, Cardmarket, eBay, Amazon, and more.`;

  const ogImage = site.ogImage || "/og-image.png";

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      title,
      description,
      siteName: site.name,
      images: [{ url: ogImage }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

/* ---------- Page ---------- */
export default async function YugiohSetPricesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id: rawId } = await params;
  const sp = await searchParams;

  const setCode = decodeURIComponent(rawId ?? "").trim();
  const currency: Currency = readCurrency(sp);

  const baseSetHref = `${CATEGORY.setsHref}/${encodeURIComponent(setCode)}`;
  const baseHref = `${baseSetHref}/prices`;

  const [header, agg] = await Promise.all([
    getSetHeaderByCode(setCode),
    getPriceSummaryBySetCode(setCode),
  ]);

  if (!header) {
    const canonical = absUrl(`/categories/yugioh/sets/${encodeURIComponent(setCode)}/prices`);
    return (
      <section className="space-y-6">
        <Script
          id="ygo-set-prices-notfound-jsonld"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebPage",
              url: canonical,
              name: "Yu-Gi-Oh! Set Prices Not Found",
            }),
          }}
        />
        <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm text-white">
          <h1 className="text-2xl font-bold">Set not found</h1>
          <p className="mt-2 text-sm text-white/70 break-all">
            Looked up set code: <code>{setCode}</code>
          </p>
          <Link href={CATEGORY.setsHref} className="mt-4 inline-block text-sky-300 hover:underline">
            ← Back to Yu-Gi-Oh! sets
          </Link>
        </div>
      </section>
    );
  }

  const setName = header.set_name?.trim() || setCode;
  const canonical = absUrl(`/categories/yugioh/sets/${encodeURIComponent(setCode)}/prices`);

  const breadcrumbsJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absUrl("/") },
      { "@type": "ListItem", position: 2, name: "Categories", item: absUrl(CATEGORY.categoriesHref) },
      { "@type": "ListItem", position: 3, name: "Yu-Gi-Oh!", item: absUrl(CATEGORY.setsHref) },
      { "@type": "ListItem", position: 4, name: "Sets", item: absUrl(CATEGORY.setsHref) },
      { "@type": "ListItem", position: 5, name: `${setName} (${setCode})`, item: absUrl(baseSetHref) },
      { "@type": "ListItem", position: 6, name: "Prices", item: canonical },
    ],
  };

  const banner = cfImageUrl(CATEGORY.bannerCfId, "categoryThumb");

  const cardsInSet = agg?.cards_in_set ?? 0;

  const blocks = [
    {
      title: "TCGplayer",
      items: [
        { label: "Average", value: fmtMoney(agg?.avg_tcgplayer, currency) },
        { label: "Low", value: fmtMoney(agg?.min_tcgplayer, currency) },
        { label: "High", value: fmtMoney(agg?.max_tcgplayer, currency) },
      ],
    },
    {
      title: "Cardmarket",
      items: [
        { label: "Average", value: fmtMoney(agg?.avg_cardmarket, currency) },
        { label: "Low", value: fmtMoney(agg?.min_cardmarket, currency) },
        { label: "High", value: fmtMoney(agg?.max_cardmarket, currency) },
      ],
    },
    {
      title: "eBay",
      items: [
        { label: "Average", value: fmtMoney(agg?.avg_ebay, currency) },
        { label: "Low", value: fmtMoney(agg?.min_ebay, currency) },
        { label: "High", value: fmtMoney(agg?.max_ebay, currency) },
      ],
    },
    {
      title: "Amazon",
      items: [
        { label: "Average", value: fmtMoney(agg?.avg_amazon, currency) },
        { label: "Low", value: fmtMoney(agg?.min_amazon, currency) },
        { label: "High", value: fmtMoney(agg?.max_amazon, currency) },
      ],
    },
    {
      title: "CoolStuffInc",
      items: [
        { label: "Average", value: fmtMoney(agg?.avg_coolstuffinc, currency) },
        { label: "Low", value: fmtMoney(agg?.min_coolstuffinc, currency) },
        { label: "High", value: fmtMoney(agg?.max_coolstuffinc, currency) },
      ],
    },
  ];

  return (
    <section className="space-y-6">
      {/* JSON-LD breadcrumbs */}
      <Script
        id="ygo-set-prices-breadcrumbs-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbsJsonLd) }}
      />

      {/* Visible breadcrumbs */}
      <nav className="text-xs text-white/70">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/" className="hover:underline">Home</Link>
          <span className="text-white/40">/</span>
          <Link href="/categories" className="hover:underline">Categories</Link>
          <span className="text-white/40">/</span>
          <Link href={CATEGORY.setsHref} className="hover:underline">Yu-Gi-Oh!</Link>
          <span className="text-white/40">/</span>
          <Link href={CATEGORY.setsHref} className="hover:underline">Sets</Link>
          <span className="text-white/40">/</span>
          <Link href={baseSetHref} className="hover:underline">{setName}</Link>
          <span className="text-white/40">/</span>
          <span className="text-white/90">Prices</span>
        </div>
      </nav>

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="relative h-20 w-36 shrink-0 rounded-lg bg-white/5 ring-1 ring-white/10 overflow-hidden">
            <Image
              src={banner}
              alt={`${setName} banner`}
              fill
              unoptimized
              className="object-contain"
              sizes="144px"
              priority
            />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">
              {CATEGORY.label}: {setName}
            </h1>
            <div className="text-sm text-white/80">
              Set code: <span className="text-white">{setCode}</span> •{" "}
              {cardsInSet.toLocaleString()} cards in set
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Currency switch (canonical ignores it to avoid duplicate indexing) */}
          <div className="rounded-md border border-white/20 bg-white/10 p-1 text-sm text-white">
            <span className="px-2">Currency:</span>
            <Link
              href={withParam(baseHref, "currency", "USD")}
              className={`rounded px-2 py-1 ${currency === "USD" ? "bg-white/20" : "hover:bg-white/10"}`}
            >
              USD
            </Link>
            <Link
              href={withParam(baseHref, "currency", "EUR")}
              className={`ml-1 rounded px-2 py-1 ${currency === "EUR" ? "bg-white/20" : "hover:bg-white/10"}`}
            >
              EUR
            </Link>
          </div>

          <Link href={baseSetHref} className="text-sky-300 hover:underline">
            ← Back to set
          </Link>
        </div>
      </div>

      {/* SEO intro */}
      <div className="max-w-3xl space-y-3 text-sm text-white/80">
        <p>
          This page shows <span className="text-white">average</span> market prices for cards in{" "}
          <span className="text-white">{setName}</span>. Use it to compare marketplaces and spot where
          pricing is moving.
        </p>
        <p>
          Want precision? Go back to the set and open individual cards — rarity and printings can
          swing prices a lot even within the same set.
        </p>
      </div>

      {/* Price blocks */}
      <div className="grid gap-4 lg:grid-cols-2">
        {blocks.map((block) => (
          <div
            key={block.title}
            className="rounded-xl border border-white/15 bg-white/5 p-5 text-white/90 backdrop-blur-sm"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">{block.title}</h2>
              <div className="text-xs text-white/70">Values shown in {currency}</div>
            </div>
            <ul className="divide-y divide-white/10">
              {block.items.map((r) => (
                <li key={r.label} className="flex items-center justify-between py-2">
                  <span className="text-white/90">{r.label}</span>
                  <span className="font-medium">{r.value}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Footer nav */}
      <div className="flex flex-wrap gap-4 text-sm">
        <Link href={CATEGORY.setsHref} className="text-sky-300 hover:underline">
          ← Back to Yu-Gi-Oh! sets
        </Link>
        <Link href={baseSetHref} className="text-sky-300 hover:underline">
          ← Back to set
        </Link>
      </div>
    </section>
  );
}
