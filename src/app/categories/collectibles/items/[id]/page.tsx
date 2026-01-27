// src/app/categories/collectibles/items/[id]/page.tsx
import "server-only";

import type React from "react";
import type { Metadata } from "next";
import Script from "next/script";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";

import CardActions from "@/components/collection/CardActions";
import MarketPrices from "@/components/MarketPrices";
import MarketValuePanel from "@/components/market/MarketValuePanel";
import PriceAlertBell from "@/components/alerts/PriceAlertBell";

import { type DisplayCurrency } from "@/lib/pricing";
import { site } from "@/config/site";
import { getUserPlan, canUsePriceAlerts } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Record<string, string | string[] | undefined>;

type ItemMetaRow = {
  id: string;
  name: string | null;
  franchise: string | null;
  series: string | null;
  line: string | null;
  number: string | null;
  edition: string | null;
  variant: string | null;
  image_small: string | null;
  image_large: string | null;
  upc: string | null;
  release_year: number | null;
  exclusivity: string | null;
  is_chase: boolean | null;
  is_exclusive: boolean | null;
  extra: any;
};

type ItemRow = ItemMetaRow & {
  description: string | null;
  source: string | null;
  source_id: string | null;
};

type ItemImageRow = {
  id: string;
  item_id: string;
  sort_order: number | null;
  label: string | null;
  url: string;
  created_at: string | null;
  updated_at: string | null;
};

type MarketItemRow = {
  id: string;
  display_name: string | null;
};

function absBase() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
    process.env.SITE_URL?.replace(/\/+$/, "") ||
    site?.url?.replace(/\/+$/, "") ||
    "https://legendary-collectibles.com"
  );
}

function absUrl(path: string) {
  const base = absBase().replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function absMaybe(urlOrPath: string | null | undefined) {
  if (!urlOrPath) return absUrl("/og-image.png");
  if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath;
  return absUrl(urlOrPath);
}

function readDisplay(sp: SearchParams): DisplayCurrency {
  const a = (Array.isArray(sp?.display) ? sp.display[0] : sp?.display) ?? "";
  const b = (Array.isArray(sp?.currency) ? sp.currency[0] : sp?.currency) ?? "";
  const v = (a || b).toUpperCase();
  return v === "USD" || v === "EUR" ? (v as DisplayCurrency) : "NATIVE";
}

function legacyBestImage(item: ItemRow | ItemMetaRow): string | null {
  return item.image_large || item.image_small || null;
}

function getBrandFromExtra(extra: any): string {
  const b = extra?.brand;
  const s = String(b ?? "").trim();
  return s || "Collectibles";
}

function fmtTitle(item: ItemMetaRow | ItemRow) {
  const brand = getBrandFromExtra(item.extra);
  const name = (item.name ?? item.id).trim();
  const num = item.number ? `#${String(item.number).trim()}` : null;
  return [brand !== "Collectibles" ? `${brand}` : null, name, num].filter(Boolean).join(" ");
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="text-xs uppercase tracking-wide text-white/60">{label}</div>
      <div className="mt-1 wrap-break-word text-sm font-medium text-white">{value}</div>
    </div>
  );
}

/**
 * Prefer the correct tables:
 * - collectibles_items
 * - collectibles_item_images
 *
 * But DO NOT crash if you haven't created them yet.
 * Fallback to funko tables during migration to keep the site stable.
 */
async function getItemMeta(itemId: string): Promise<ItemMetaRow | null> {
  noStore();

  // 1) Preferred: collectibles_items
  try {
    const res = await db.execute<ItemMetaRow>(sql`
      SELECT
        id::text as id,
        name,
        franchise,
        series,
        line,
        number,
        edition,
        variant,
        image_small,
        image_large,
        upc,
        release_year,
        exclusivity,
        is_chase,
        is_exclusive,
        extra
      FROM public.collectibles_items
      WHERE id = ${itemId}
      LIMIT 1
    `);
    return res.rows?.[0] ?? null;
  } catch {
    // 2) Fallback: funko_items
    try {
      const res2 = await db.execute<ItemMetaRow>(sql`
        SELECT
          id::text as id,
          name,
          franchise,
          series,
          line,
          number,
          edition,
          variant,
          image_small,
          image_large,
          upc,
          release_year,
          exclusivity,
          is_chase,
          is_exclusive,
          extra
        FROM public.funko_items
        WHERE id = ${itemId}
        LIMIT 1
      `);
      return res2.rows?.[0] ?? null;
    } catch {
      return null;
    }
  }
}

async function getItemById(itemId: string): Promise<ItemRow | null> {
  noStore();

  // 1) Preferred: collectibles_items
  try {
    const res = await db.execute<ItemRow>(sql`
      SELECT
        id::text as id,
        name,
        franchise,
        series,
        line,
        number,
        edition,
        variant,
        image_small,
        image_large,
        upc,
        release_year,
        exclusivity,
        is_chase,
        is_exclusive,
        description,
        source,
        source_id,
        extra
      FROM public.collectibles_items
      WHERE id = ${itemId}
      LIMIT 1
    `);
    return res.rows?.[0] ?? null;
  } catch {
    // 2) Fallback: funko_items
    try {
      const res2 = await db.execute<ItemRow>(sql`
        SELECT
          id::text as id,
          name,
          franchise,
          series,
          line,
          number,
          edition,
          variant,
          image_small,
          image_large,
          upc,
          release_year,
          exclusivity,
          is_chase,
          is_exclusive,
          description,
          source,
          source_id,
          extra
        FROM public.funko_items
        WHERE id = ${itemId}
        LIMIT 1
      `);
      return res2.rows?.[0] ?? null;
    } catch {
      return null;
    }
  }
}

async function getImages(itemId: string): Promise<ItemImageRow[]> {
  noStore();

  // 1) Preferred: collectibles_item_images
  try {
    const res = await db.execute<ItemImageRow>(sql`
      SELECT
        id::text as id,
        item_id,
        sort_order,
        label,
        url,
        created_at::text,
        updated_at::text
      FROM public.collectibles_item_images
      WHERE item_id = ${itemId}
      ORDER BY
        (CASE WHEN label = 'main' THEN 0 ELSE 1 END) ASC,
        sort_order ASC NULLS LAST,
        created_at ASC
    `);
    return (res.rows ?? []).filter((r) => String(r.url || "").trim().length > 0);
  } catch {
    // 2) Fallback: funko_item_images
    try {
      const res2 = await db.execute<ItemImageRow>(sql`
        SELECT
          id::text as id,
          item_id,
          sort_order,
          label,
          url,
          created_at::text,
          updated_at::text
        FROM public.funko_item_images
        WHERE item_id = ${itemId}
        ORDER BY
          (CASE WHEN label = 'main' THEN 0 ELSE 1 END) ASC,
          sort_order ASC NULLS LAST,
          created_at ASC
      `);
      return (res2.rows ?? []).filter((r) => String(r.url || "").trim().length > 0);
    } catch {
      return [];
    }
  }
}

async function getMarketItem(itemId: string): Promise<MarketItemRow | null> {
  noStore();

  // If you later add a market_items mapping for collectibles, switch this to game='collectibles'
  // Keeping 'funko' for now so the page doesn't break if the market system is strict.
  try {
    const res = await db.execute<MarketItemRow>(sql`
      SELECT id::text as id, display_name
      FROM public.market_items
      WHERE game = 'funko'
        AND canonical_id::text = ${itemId}::text
      LIMIT 1
    `);
    return res.rows?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const p = await params;
  const raw = decodeURIComponent(String(p?.id ?? "")).trim();

  const canonical = absUrl(`/categories/collectibles/items/${encodeURIComponent(raw)}`);

  if (!raw) {
    return {
      title: `Figures & Collectibles | ${site.name}`,
      description: `Browse figures and collectibles on ${site.name}.`,
      alternates: { canonical: absUrl("/categories/collectibles/items") },
      robots: { index: false, follow: true },
    };
  }

  const [item, images] = await Promise.all([getItemMeta(raw), getImages(raw)]);

  if (!item) {
    return {
      title: `Item Not Found | ${site.name}`,
      description: `We couldn’t find that item. Browse Figures & Collectibles and try again.`,
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
  }

  const brand = getBrandFromExtra(item.extra);
  const title = `${fmtTitle(item)} — ${brand} Figure Details | ${site.name}`;
  const description =
    `Item details for ${item.name ?? item.id}` +
    (item.franchise ? ` • Franchise: ${item.franchise}` : "") +
    (item.series ? ` • Series: ${item.series}` : "") +
    (item.number ? ` • Number: ${item.number}` : "") +
    ` • Images and details.`;

  const ogCandidate = images[0]?.url || legacyBestImage(item) || site.ogImage || "/og-image.png";
  const ogImage = absMaybe(ogCandidate);

  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
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

export default async function CollectibleItemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const p = await params;
  const sp = await searchParams;

  const rawId = decodeURIComponent(String(p?.id ?? "")).trim();
  const { userId } = await auth();
  const signedIn = !!userId;
  const canSave = signedIn;

  // strip UI-only currency params
  const hasUiCurrencyParams = sp?.display !== undefined || sp?.currency !== undefined;
  if (hasUiCurrencyParams) {
    redirect(`/categories/collectibles/items/${encodeURIComponent(rawId)}`);
  }

  const display = readDisplay(sp);

  const [item, images] = await Promise.all([getItemById(rawId), getImages(rawId)]);

  const canonicalItem = absUrl(`/categories/collectibles/items/${encodeURIComponent(rawId)}`);

  if (!item) {
    return (
      <section className="space-y-6">
        <Script
          id="collectibles-notfound-jsonld"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebPage",
              url: canonicalItem,
              name: "Collectible Item Not Found",
            }),
          }}
        />
        <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
          <h1 className="text-2xl font-bold text-white">Item not found</h1>
          <p className="mt-2 break-all text-sm text-white/70">
            Looked up: <code>{rawId}</code>
          </p>
          <Link href="/categories/collectibles/items" className="mt-4 inline-block text-sky-300 hover:underline">
            ← Back to Figures &amp; Collectibles
          </Link>
        </div>
      </section>
    );
  }

  const brand = getBrandFromExtra(item.extra);
  const pageTitle = fmtTitle(item);
  const canonical = absUrl(`/categories/collectibles/items/${encodeURIComponent(item.id)}`);

  const cover = images[0]?.url || legacyBestImage(item);
  const coverAbs = cover ? absMaybe(cover) : null;

  let planTier: "free" | "collector" | "pro" = "free";
  let canUseAlerts = false;
  let marketItemId: string | null = null;

  if (userId) {
    const plan = await getUserPlan(userId);
    planTier = plan.id === "pro" ? "pro" : plan.id === "collector" ? "collector" : "free";
    canUseAlerts = canUsePriceAlerts(plan);

    if (canUseAlerts) {
      const marketItem = await getMarketItem(item.id);
      marketItemId = marketItem?.id ?? null;
    }
  }

  const thingId = `${canonical}#product`;

  const breadcrumbsJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absUrl("/") },
      { "@type": "ListItem", position: 2, name: "Categories", item: absUrl("/categories") },
      { "@type": "ListItem", position: 3, name: "Figures & Collectibles", item: absUrl("/categories/collectibles/items") },
      { "@type": "ListItem", position: 4, name: pageTitle, item: canonical },
    ],
  };

  const gtin = (item.upc ?? "").replace(/\D+/g, "");
  const gtinProps: Record<string, string> = {};
  if (gtin.length === 12) gtinProps.gtin12 = gtin;
  else if (gtin.length === 13) gtinProps.gtin13 = gtin;
  else if (gtin.length === 14) gtinProps.gtin14 = gtin;

  const productJsonLd: any = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": thingId,
    name: pageTitle,
    description:
      item.description ??
      [
        brand ? `Brand: ${brand}` : null,
        item.franchise ? `Franchise: ${item.franchise}` : null,
        item.series ? `Series: ${item.series}` : null,
        item.number ? `Number: ${item.number}` : null,
        item.release_year ? `Release year: ${item.release_year}` : null,
      ]
        .filter(Boolean)
        .join(" • "),
    sku: item.id,
    brand: { "@type": "Brand", name: brand || "Collectibles" },
    url: canonical,
    image: coverAbs ? [coverAbs] : undefined,
    ...gtinProps,
    category: "Collectibles > Figures",
  };

  return (
    <section className="space-y-8">
      <Script id="collectibles-breadcrumbs-jsonld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbsJsonLd) }} />
      <Script id="collectibles-product-jsonld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />

      <nav className="text-xs text-white/70">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/" className="hover:underline">Home</Link>
          <span className="text-white/40">/</span>
          <Link href="/categories" className="hover:underline">Categories</Link>
          <span className="text-white/40">/</span>
          <Link href="/categories/collectibles/items" className="hover:underline">Figures &amp; Collectibles</Link>
          <span className="text-white/40">/</span>
          <span className="text-white/90">{pageTitle}</span>
        </div>
      </nav>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <section className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
            <h2 className="sr-only">Images</h2>

            <div className="relative mx-auto aspect-3/4 w-full max-w-md">
              {cover ? (
                <Image
                  src={cover}
                  alt={`${pageTitle} — main image`}
                  fill
                  unoptimized
                  className="object-contain"
                  sizes="(max-width: 1024px) 80vw, 480px"
                  priority
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center text-white/70">No image</div>
              )}
            </div>

            {images.length > 1 ? (
              <div className="mt-4">
                <h3 className="mb-2 text-xs uppercase tracking-wide text-white/60">Gallery</h3>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                  {images.map((img, idx) => (
                    <figure
                      key={img.id}
                      className="relative aspect-square overflow-hidden rounded-lg border border-white/10 bg-black/30"
                      title={`${img.label ?? "image"} • sort ${img.sort_order ?? ""}`}
                    >
                      <Image
                        src={img.url}
                        alt={`${pageTitle} — image ${idx + 1}`}
                        fill
                        unoptimized
                        className="object-contain"
                        sizes="120px"
                      />
                      <figcaption className="sr-only">{`${pageTitle} — image ${idx + 1}`}</figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        </div>

        <div className="lg:col-span-7 space-y-4">
          <section className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
            <h1 className="text-2xl font-bold text-white">{pageTitle}</h1>
            <p className="mt-2 text-sm text-white/70">
              Item details including images and market references where available.
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Brand" value={brand || null} />
              <Field label="Franchise" value={item.franchise} />
              <Field label="Series" value={item.series} />
              <Field label="Line" value={item.line} />
              <Field label="Number" value={item.number ? `#${item.number}` : null} />
              <Field label="Release Year" value={item.release_year ? String(item.release_year) : null} />
              <Field label="UPC" value={item.upc} />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              {/* Keeping game="funko" for now to avoid breaking strict unions in existing components.
                  When you add "collectibles" support to CardActions/MarketPrices, we’ll switch it cleanly. */}
              <CardActions
                canSave={canSave}
                game="funko"
                cardId={item.id}
                cardName={pageTitle}
                setName={(item.franchise ?? item.series ?? item.line ?? undefined) as any}
                imageUrl={cover ?? undefined}
              />

              {signedIn ? (
                canUseAlerts ? (
                  marketItemId ? (
                    <PriceAlertBell game="funko" marketItemId={marketItemId} label={pageTitle} currentUsd={null} />
                  ) : (
                    <span className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs text-white/70">
                      🔔 Alerts unavailable
                    </span>
                  )
                ) : (
                  <Link
                    href="/pricing"
                    className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10"
                    prefetch={false}
                  >
                    🔔 Price alerts (Pro)
                  </Link>
                )
              ) : null}
            </div>
          </section>

          <section>
            <h2 className="sr-only">Market Prices</h2>
            <MarketPrices category="funko" cardId={item.id} display={display} />
          </section>

          <section>
            <h2 className="sr-only">Market Value</h2>
            <MarketValuePanel
              game="funko"
              canonicalId={item.id}
              title="Market Value"
              showDisclaimer
              canSeeRanges={planTier === "collector" || planTier === "pro"}
              canSeeConfidence={planTier === "pro"}
            />
          </section>

          {item.description ? (
            <section className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm text-white">
              <h2 className="mb-2 text-lg font-semibold">Description</h2>
              <p className="whitespace-pre-wrap text-sm text-white/80">{item.description}</p>
            </section>
          ) : null}

          {item.extra ? (
            <section className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm text-white">
              <h2 className="mb-2 text-lg font-semibold">Extra</h2>
              <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap wrap-break-word rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-white/80">
                {typeof item.extra === "string" ? item.extra : JSON.stringify(item.extra, null, 2)}
              </pre>
            </section>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/categories/collectibles/items" className="text-sky-300 hover:underline">
          ← Back to Figures &amp; Collectibles
        </Link>
      </div>
    </section>
  );
}
