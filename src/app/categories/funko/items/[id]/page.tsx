// src/app/categories/funko/items/[id]/page.tsx
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

import FunkoAlertBanners from "@/components/funko/FunkoAlertBanners";
import FunkoBuyNowLinks from "@/components/funko/FunkoBuyNowLinks";
import FunkoRelatedPanel from "@/components/funko/FunkoRelatedPanel";
import FunkoCollectionControls from "@/components/funko/FunkoCollectionControls";

import { type DisplayCurrency } from "@/lib/pricing";
import { site } from "@/config/site";
import { getUserPlan, canUsePriceAlerts } from "@/lib/plans";
import { queryRelatedFunko, type FunkoListRow } from "@/lib/funko/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Record<string, string | string[] | undefined>;

type FunkoMetaRow = {
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

type FunkoRow = FunkoMetaRow & {
  description: string | null;
  source: string | null;
  source_id: string | null;
};

type FunkoItemImageRow = {
  id: string; // uuid text
  item_id: string;
  sort_order: number | null;
  label: string | null;
  url: string;
  created_at: string | null;
  updated_at: string | null;
};

type FunkoVariantFlags =
  | {
      chase: boolean;
      glow: boolean;
      metallic: boolean;
      flocked: boolean;
      glitter: boolean;
      translucent: boolean;
      chrome: boolean;
      jumbo: boolean;
      gitd: boolean;
      notes: string | null;
    }
  | null;

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

function legacyBestImage(item: FunkoRow | FunkoMetaRow): string | null {
  return item.image_large || item.image_small || null;
}

function fmtTitle(item: FunkoMetaRow | FunkoRow) {
  const name = (item.name ?? item.id).trim();
  const num = item.number ? `#${String(item.number).trim()}` : null;
  const line = item.line ? String(item.line).trim() : null;

  const parts = [name, num].filter(Boolean).join(" ");
  return line ? `${parts} (${line})` : parts;
}

function yesNo(v: boolean | null | undefined): string | null {
  if (v == null) return null;
  return v ? "Yes" : "No";
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

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/15 bg-white/10 px-2 py-1 text-xs text-white">
      {children}
    </span>
  );
}

function TextBlock({ title, text }: { title: string; text: string | null }) {
  if (!text) return null;
  return (
    <section className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm text-white">
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      <p className="whitespace-pre-wrap text-sm text-white/80">{text}</p>
    </section>
  );
}

async function getFunkoMeta(itemId: string): Promise<FunkoMetaRow | null> {
  noStore();
  return (
    (
      await db.execute<FunkoMetaRow>(sql`
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
      `)
    ).rows?.[0] ?? null
  );
}

async function getFunkoById(itemId: string): Promise<FunkoRow | null> {
  noStore();
  return (
    (
      await db.execute<FunkoRow>(sql`
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
      `)
    ).rows?.[0] ?? null
  );
}

async function getFunkoImages(itemId: string): Promise<FunkoItemImageRow[]> {
  noStore();
  const res = await db.execute<FunkoItemImageRow>(sql`
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

  return (res.rows ?? []).filter((r) => String(r.url || "").trim().length > 0);
}

async function getFunkoVariantFlags(itemId: string): Promise<FunkoVariantFlags> {
  noStore();
  try {
    const row =
      (
        await db.execute<{
          chase: boolean | null;
          glow: boolean | null;
          metallic: boolean | null;
          flocked: boolean | null;
          glitter: boolean | null;
          translucent: boolean | null;
          chrome: boolean | null;
          jumbo: boolean | null;
          gitd: boolean | null;
          notes: string | null;
        }>(sql`
          SELECT chase, glow, metallic, flocked, glitter, translucent, chrome, jumbo, gitd, notes
          FROM public.funko_item_variants
          WHERE item_id = ${itemId}
          LIMIT 1
        `)
      ).rows?.[0] ?? null;

    if (!row) return null;

    return {
      chase: row.chase === true,
      glow: row.glow === true,
      metallic: row.metallic === true,
      flocked: row.flocked === true,
      glitter: row.glitter === true,
      translucent: row.translucent === true,
      chrome: row.chrome === true,
      jumbo: row.jumbo === true,
      gitd: row.gitd === true,
      notes: row.notes ?? null,
    };
  } catch {
    return null;
  }
}

async function getOwnedVariantCounts(userId: string | null, itemId: string) {
  if (!userId) return {};
  noStore();

  const res = await db.execute<{ variant_type: string | null; qty: number }>(sql`
    SELECT variant_type, COALESCE(SUM(quantity),0)::int AS qty
    FROM public.user_collection_items
    WHERE user_id = ${userId}
      AND game = 'funko'
      AND card_id = ${itemId}
    GROUP BY variant_type
  `);

  const out: Record<string, number> = {};
  for (const r of res.rows ?? []) {
    const key = String(r.variant_type ?? "normal").trim() || "normal";
    out[key] = Number(r.qty) || 0;
  }
  return out;
}

async function getMarketItemForFunko(itemId: string): Promise<MarketItemRow | null> {
  noStore();
  try {
    return (
      (
        await db.execute<MarketItemRow>(sql`
          SELECT id::text as id, display_name
          FROM public.market_items
          WHERE game = 'funko'
            AND canonical_id::text = ${itemId}::text
          LIMIT 1
        `)
      ).rows?.[0] ?? null
    );
  } catch {
    return null;
  }
}

function guessImageFileName(item: FunkoMetaRow) {
  const num = item.number ? String(item.number).trim() : "";
  const base = num ? `Funko_Pop_${num}` : `Funko_Pop_${item.id}`;
  return `${base}.jpg`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const p = await params;
  const raw = decodeURIComponent(String(p?.id ?? "")).trim();

  if (!raw) {
    return {
      title: `Funko | ${site.name}`,
      description: `Browse Funko Pops, track prices, and manage your collection on ${site.name}.`,
      keywords: ["Funko", "Funko Pop", "collectibles", "vinyl figure", "price tracking", "collection"],
      alternates: { canonical: absUrl("/categories/funko/items") },
      robots: { index: false, follow: true },
    };
  }

  const [item, images] = await Promise.all([getFunkoMeta(raw), getFunkoImages(raw)]);
  const canonical = absUrl(`/categories/funko/items/${encodeURIComponent(item?.id ?? raw)}`);

  if (!item) {
    return {
      title: `Funko Item Not Found | ${site.name}`,
      description: `We couldn’t find that Funko item. Browse Funko and try again.`,
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
  }

  const title = `${fmtTitle(item)} — Funko Pop Details, Variants & Market Prices | ${site.name}`;
  const description =
    `Funko Pop details for ${item.name ?? item.id}` +
    (item.franchise ? ` • Franchise: ${item.franchise}` : "") +
    (item.series ? ` • Series: ${item.series}` : "") +
    (item.number ? ` • Number: ${item.number}` : "") +
    ` • Images, variants, and market pricing.`;

  const ogCandidate = images[0]?.url || legacyBestImage(item) || site.ogImage || "/og-image.png";
  const ogImage = absMaybe(ogCandidate);

  return {
    title,
    description,
    keywords: [
      "Funko",
      "Funko Pop",
      item.franchise ?? "",
      item.series ?? "",
      item.line ?? "",
      item.number ? `Funko Pop ${item.number}` : "",
      "chase",
      "exclusive",
      "market price",
      "collection tracker",
    ].filter(Boolean),
    alternates: { canonical },
    robots: { index: true, follow: true },

    // ✅ Next.js Metadata OpenGraph does NOT support type: "product"
    // Keep it as "website" and put Product schema in JSON-LD below.
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

export default async function FunkoItemDetailPage({
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
    redirect(`/categories/funko/items/${encodeURIComponent(rawId)}`);
  }

  const display = readDisplay(sp);

  const [item, flags, images] = await Promise.all([
    getFunkoById(rawId),
    getFunkoVariantFlags(rawId),
    getFunkoImages(rawId),
  ]);

  const canonicalItem = absUrl(`/categories/funko/items/${encodeURIComponent(rawId)}`);

  if (!item) {
    return (
      <section className="space-y-6">
        <Script
          id="funko-notfound-jsonld"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebPage",
              url: canonicalItem,
              name: "Funko Item Not Found",
            }),
          }}
        />
        <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
          <h1 className="text-2xl font-bold text-white">Item not found</h1>
          <p className="mt-2 break-all text-sm text-white/70">
            Looked up: <code>{rawId}</code>
          </p>
          <Link href="/categories/funko/items" className="mt-4 inline-block text-sky-300 hover:underline">
            ← Back to Funko
          </Link>
        </div>
      </section>
    );
  }

  const pageTitle = fmtTitle(item);
  const itemName = (item.name ?? item.id).trim();
  const canonical = absUrl(`/categories/funko/items/${encodeURIComponent(item.id)}`);

  // cover uses funko_item_images first, then fallback
  const cover = images[0]?.url || legacyBestImage(item);
  const coverAbs = cover ? absMaybe(cover) : null;

  const pricesHref = `/categories/funko/items/${encodeURIComponent(item.id)}/prices`;
  const ownedCounts = await getOwnedVariantCounts(userId ?? null, item.id);

  let planTier: "free" | "collector" | "pro" = "free";
  let canUseAlerts = false;
  let marketItemId: string | null = null;

  if (userId) {
    const plan = await getUserPlan(userId);
    planTier = plan.id === "pro" ? "pro" : plan.id === "collector" ? "collector" : "free";
    canUseAlerts = canUsePriceAlerts(plan);

    if (canUseAlerts) {
      const marketItem = await getMarketItemForFunko(item.id);
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
      { "@type": "ListItem", position: 3, name: "Funko", item: absUrl("/categories/funko/items") },
      { "@type": "ListItem", position: 4, name: pageTitle, item: canonical },
    ],
  };

  const allImageAbs = images.map((i) => absMaybe(i.url)).filter(Boolean);
  const imageObjects = allImageAbs.map((u, idx) => ({
    "@type": "ImageObject",
    contentUrl: u,
    url: u,
    name: idx === 0 ? guessImageFileName(item) : `Funko_Pop_${item.number ?? item.id}_${idx + 1}.jpg`,
    caption: `${pageTitle} — image ${idx + 1}`,
  }));

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
        item.franchise ? `Franchise: ${item.franchise}` : null,
        item.series ? `Series: ${item.series}` : null,
        item.number ? `Number: ${item.number}` : null,
        item.edition ? `Edition: ${item.edition}` : null,
        item.variant ? `Variant: ${item.variant}` : null,
        item.release_year ? `Release year: ${item.release_year}` : null,
        item.exclusivity ? `Exclusivity: ${item.exclusivity}` : null,
      ]
        .filter(Boolean)
        .join(" • "),
    sku: item.id,
    brand: { "@type": "Brand", name: "Funko" },
    url: canonical,
    image: imageObjects.length ? imageObjects : coverAbs ? [coverAbs] : undefined,
    ...gtinProps,
    category: "Collectibles > Funko Pops",
  };

  const webPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${canonical}#webpage`,
    url: canonical,
    name: `${pageTitle} — Funko`,
    isPartOf: { "@type": "WebSite", name: site.name ?? "Legendary Collectibles", url: absBase() },
    primaryImageOfPage: coverAbs ? { "@type": "ImageObject", url: coverAbs } : undefined,
    mainEntity: { "@id": thingId },
  };

  const chips: string[] = [];
  if (item.number) chips.push(`#${String(item.number).trim()}`);
  if (item.is_chase === true || flags?.chase) chips.push("Chase");
  if (item.is_exclusive === true || !!item.exclusivity) chips.push("Exclusive");
  if (flags?.gitd || flags?.glow) chips.push("GITD");
  if (flags?.metallic) chips.push("Metallic");
  if (flags?.flocked) chips.push("Flocked");
  if (flags?.glitter) chips.push("Glitter");
  if (flags?.translucent) chips.push("Translucent");
  if (flags?.chrome) chips.push("Chrome");
  if (flags?.jumbo) chips.push("Jumbo");

  // related items for internal linking
  const related: FunkoListRow[] = await queryRelatedFunko({
    itemId: item.id,
    franchise: item.franchise ?? null,
    series: item.series ?? null,
    limit: 120,
  });

  return (
    <section className="space-y-8">
      <Script id="funko-webpage-jsonld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }} />
      <Script id="funko-breadcrumbs-jsonld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbsJsonLd) }} />
      <Script id="funko-product-jsonld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />

      <nav className="text-xs text-white/70">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/" className="hover:underline">Home</Link>
          <span className="text-white/40">/</span>
          <Link href="/categories" className="hover:underline">Categories</Link>
          <span className="text-white/40">/</span>
          <Link href="/categories/funko/items" className="hover:underline">Funko</Link>
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

            {cover ? (
              <p className="mt-2 text-xs text-white/60">
                Image: <span className="text-white/80">{guessImageFileName(item)}</span>
              </p>
            ) : null}

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

            <div className="mt-3 space-y-3">
              <FunkoAlertBanners
                isChase={item.is_chase === true || flags?.chase}
                isExclusive={item.is_exclusive === true}
                exclusivity={item.exclusivity}
                releaseYear={item.release_year}
                extra={item.extra}
              />

              {chips.length ? (
                <div className="flex flex-wrap gap-2">
                  {chips.map((c) => (
                    <Chip key={c}>{c}</Chip>
                  ))}
                </div>
              ) : null}

              {Object.keys(ownedCounts).length ? (
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-xs uppercase tracking-wide text-white/60">Owned in your collection</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(ownedCounts).map(([k, qty]) => (
                      <Chip key={k}>
                        {k}: {qty}
                      </Chip>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <h3 className="text-xs uppercase tracking-wide text-white/60">Buy / Trade</h3>
                <div className="mt-2 space-y-2">
                  <FunkoBuyNowLinks name={itemName} franchise={item.franchise} series={item.series} number={item.number} upc={item.upc} />
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/trade?item=${encodeURIComponent(item.id)}`}
                      className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs text-white/85 hover:bg-white/10"
                      prefetch={false}
                    >
                      🔁 Trade with others
                    </Link>
                    <Link
                      href={pricesHref}
                      className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs text-white/85 hover:bg-white/10"
                    >
                      📈 View prices
                    </Link>
                  </div>
                </div>
              </div>

              {/* ✅ FIXED: interactive buttons moved into a Client Component */}
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <h3 className="text-xs uppercase tracking-wide text-white/60">Collection</h3>
                <FunkoCollectionControls signedIn={signedIn} itemId={item.id} className="mt-2" />
              </div>
            </div>
          </section>
        </div>

        <div className="lg:col-span-7 space-y-4">
          <section className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-white">{pageTitle}</h1>

                <p className="mt-2 text-sm text-white/70">
                  Funko Pop details including images, variants, and market prices. Track it in your collection, set alerts,
                  or explore related items.
                </p>

                <div className="mt-3 text-sm text-white/80">
                  <span className="mr-3 text-white/60">ID:</span>
                  <span className="mr-4 break-all">{item.id}</span>
                  {item.franchise ? (
                    <>
                      <span className="mr-3 text-white/60">Franchise:</span>
                      <span className="mr-4">{item.franchise}</span>
                    </>
                  ) : null}
                  {item.series ? (
                    <>
                      <span className="mr-3 text-white/60">Series:</span>
                      <span>{item.series}</span>
                    </>
                  ) : null}
                </div>

                <div className="mt-2 text-xs text-white/60">
                  {item.line ? <span className="mr-3">Line: {item.line}</span> : null}
                  {item.number ? <span className="mr-3">Number: {item.number}</span> : null}
                  {item.release_year ? <span className="mr-3">Release: {item.release_year}</span> : null}
                  {item.upc ? <span className="mr-3">UPC: {item.upc}</span> : null}
                  {item.exclusivity ? <span className="mr-3">Exclusive: {item.exclusivity}</span> : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-sm">
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
                ) : (
                  <Link
                    href="/sign-in"
                    className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10"
                    prefetch={false}
                  >
                    🔔 Sign in for alerts
                  </Link>
                )}

                <Link href={pricesHref} className="text-sky-300 hover:underline">
                  View prices →
                </Link>
              </div>
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
        </div>
      </div>

      <section className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <h2 className="mb-3 text-lg font-semibold text-white">Item Details</h2>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Franchise" value={item.franchise} />
          <Field label="Series" value={item.series} />
          <Field label="Line" value={item.line} />
          <Field label="Number" value={item.number ? `#${item.number}` : null} />
          <Field label="Edition" value={item.edition} />
          <Field label="Variant (text)" value={item.variant} />
          <Field label="Chase" value={yesNo(item.is_chase)} />
          <Field label="Exclusive" value={yesNo(item.is_exclusive)} />
          <Field label="Exclusivity" value={item.exclusivity} />
          <Field label="Release Year" value={item.release_year ? String(item.release_year) : null} />
          <Field label="UPC" value={item.upc} />
          <Field label="Source" value={item.source} />
          <Field label="Source ID" value={item.source_id} />
        </div>

        {flags ? (
          <div className="mt-4 rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
            <h3 className="mb-2 text-sm font-semibold text-white">Variant Flags</h3>
            <div className="flex flex-wrap gap-2">
              {flags.chase ? <Chip>Chase</Chip> : null}
              {flags.gitd || flags.glow ? <Chip>GITD</Chip> : null}
              {flags.metallic ? <Chip>Metallic</Chip> : null}
              {flags.flocked ? <Chip>Flocked</Chip> : null}
              {flags.glitter ? <Chip>Glitter</Chip> : null}
              {flags.translucent ? <Chip>Translucent</Chip> : null}
              {flags.chrome ? <Chip>Chrome</Chip> : null}
              {flags.jumbo ? <Chip>Jumbo</Chip> : null}
            </div>
            {flags.notes ? <p className="mt-3 text-sm text-white/70">{flags.notes}</p> : null}
          </div>
        ) : null}
      </section>

      <TextBlock title="Description" text={item.description} />

      {item.extra ? (
        <section className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm text-white">
          <h2 className="mb-2 text-lg font-semibold">Extra</h2>
          <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap wrap-break-word rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-white/80">
            {typeof item.extra === "string" ? item.extra : JSON.stringify(item.extra, null, 2)}
          </pre>
        </section>
      ) : null}

      <FunkoRelatedPanel items={related as any} />

      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/categories/funko/items" className="text-sky-300 hover:underline">
          ← Back to Funko
        </Link>
        <Link href={pricesHref} className="text-sky-300 hover:underline">
          → Prices
        </Link>
      </div>
    </section>
  );
}
