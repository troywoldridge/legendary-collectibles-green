 
 
import "server-only";

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

/* ------------------------------------------------
   Types
------------------------------------------------- */
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
};

type FunkoRow = {
  id: string;
  name: string | null;
  franchise: string | null;
  series: string | null;
  line: string | null;
  number: string | null;
  edition: string | null;
  variant: string | null;
  is_chase: boolean | null;
  is_exclusive: boolean | null;
  exclusivity: string | null;
  release_year: number | null;
  upc: string | null;
  description: string | null;
  image_small: string | null;
  image_large: string | null;
  source: string | null;
  source_id: string | null;
  extra: any;
};

type FunkoVariantFlags = {
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
} | null;

type MarketItemRow = {
  id: string; // uuid
  display_name: string | null;
};

/* ------------------------------------------------
   SEO helpers (absolute URLs)
------------------------------------------------- */
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

/* ------------------------------------------------
   Helpers
------------------------------------------------- */
function readDisplay(sp: SearchParams): DisplayCurrency {
  const a = (Array.isArray(sp?.display) ? sp.display[0] : sp?.display) ?? "";
  const b = (Array.isArray(sp?.currency) ? sp.currency[0] : sp?.currency) ?? "";
  const v = (a || b).toUpperCase();
  return v === "USD" || v === "EUR" ? (v as DisplayCurrency) : "NATIVE";
}

function bestImage(item: FunkoRow | FunkoMetaRow): string | null {
  return item.image_large || item.image_small || null;
}

function truthy(v: unknown): boolean {
  return v === true;
}

function yesNo(v: boolean | null | undefined): string | null {
  if (v == null) return null;
  return v ? "Yes" : "No";
}

function fmtTitle(item: FunkoMetaRow | FunkoRow) {
  const name = (item.name ?? item.id).trim();
  const num = item.number ? `#${String(item.number).trim()}` : null;
  const line = item.line ? String(item.line).trim() : null;

  // Example: "Batman #01 (Pop!)"
  const parts = [name, num].filter(Boolean).join(" ");
  return line ? `${parts} (${line})` : parts;
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
    <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm text-white">
      <div className="mb-2 text-sm font-semibold">{title}</div>
      <div className="whitespace-pre-wrap text-sm text-white/80">{text}</div>
    </div>
  );
}

/* ------------------------------------------------
   DB queries
------------------------------------------------- */
async function getFunkoMeta(itemId: string): Promise<FunkoMetaRow | null> {
  noStore();
  return (
    (
      await db.execute<FunkoMetaRow>(sql`
        SELECT
          id,
          name,
          franchise,
          series,
          line,
          number,
          edition,
          variant,
          image_small,
          image_large
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
          id,
          name,
          franchise,
          series,
          line,
          number,
          edition,
          variant,
          is_chase,
          is_exclusive,
          exclusivity,
          release_year,
          upc,
          description,
          image_small,
          image_large,
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
    // table may not exist yet
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
          SELECT id, display_name
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

/* ------------------------------------------------
   Metadata
------------------------------------------------- */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const p = await params;
  const raw = decodeURIComponent(String(p?.id ?? "")).trim();

  if (!raw) {
    return {
      title: `Funko Pops | ${site.name}`,
      description: `Browse Funko Pops, track prices, and manage your collection on ${site.name}.`,
      alternates: { canonical: absUrl("/categories/funko/items") },
      robots: { index: false, follow: true },
    };
  }

  const item = await getFunkoMeta(raw);
  const canonical = absUrl(`/categories/funko/items/${encodeURIComponent(item?.id ?? raw)}`);

  if (!item) {
    return {
      title: `Funko Item Not Found | ${site.name}`,
      description: `We couldn’t find that Funko item. Browse Funko and try again.`,
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
  }

  const title = `${fmtTitle(item)} — Price, Details & Collection | ${site.name}`;

  const description = [
    `View ${item.name ?? item.id} Funko item details`,
    item.franchise ? `franchise: ${item.franchise}` : null,
    item.series ? `series: ${item.series}` : null,
    item.number ? `number: ${item.number}` : null,
    item.edition ? `edition: ${item.edition}` : null,
    item.variant ? `variant: ${item.variant}` : null,
    "market prices and trends",
    "add to your collection",
  ]
    .filter(Boolean)
    .join(", ")
    .concat(".");

  const ogImage = absMaybe(bestImage(item) || site.ogImage || "/og-image.png");

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

/* ------------------------------------------------
   Page
------------------------------------------------- */
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
  const canSave = !!userId;

  // ✅ Canonical ignores display/currency -> redirect if present
  const canonical = absUrl(`/categories/funko/items/${encodeURIComponent(rawId)}`);
  const hasUiCurrencyParams = sp?.display !== undefined || sp?.currency !== undefined;
  if (hasUiCurrencyParams) {
    redirect(`/categories/funko/items/${encodeURIComponent(rawId)}`);
  }

  const display = readDisplay(sp);

  const [item, flags] = await Promise.all([getFunkoById(rawId), getFunkoVariantFlags(rawId)]);

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
              url: canonical,
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

  const itemName = (item.name ?? item.id).trim();
  const pageTitle = fmtTitle(item);
  const canonicalItem = absUrl(`/categories/funko/items/${encodeURIComponent(item.id)}`);
  const cover = bestImage(item);
  const coverAbs = cover ? absMaybe(cover) : null;

  const pricesHref = `/categories/funko/items/${encodeURIComponent(item.id)}/prices`;

  // owned counts
  const ownedCounts = await getOwnedVariantCounts(userId ?? null, item.id);

  // ---- Plan + alerts (single fetch) ----
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

  // JSON-LD (Thing, not Product)
  const thingId = `${canonicalItem}#thing`;

  const breadcrumbsJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absUrl("/") },
      { "@type": "ListItem", position: 2, name: "Categories", item: absUrl("/categories") },
      { "@type": "ListItem", position: 3, name: "Funko", item: absUrl("/categories/funko/items") },
      { "@type": "ListItem", position: 4, name: pageTitle, item: canonicalItem },
    ],
  };

  const thingJsonLd: any = {
    "@context": "https://schema.org",
    "@type": "Thing",
    "@id": thingId,
    name: pageTitle,
    identifier: item.id,
    url: canonicalItem,
    image: coverAbs ? [coverAbs] : undefined,
    description: [
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
    additionalProperty: [
      item.franchise ? { "@type": "PropertyValue", name: "Franchise", value: item.franchise } : null,
      item.series ? { "@type": "PropertyValue", name: "Series", value: item.series } : null,
      item.line ? { "@type": "PropertyValue", name: "Line", value: item.line } : null,
      item.number ? { "@type": "PropertyValue", name: "Number", value: item.number } : null,
      item.edition ? { "@type": "PropertyValue", name: "Edition", value: item.edition } : null,
      item.variant ? { "@type": "PropertyValue", name: "Variant", value: item.variant } : null,
      item.release_year ? { "@type": "PropertyValue", name: "Release Year", value: String(item.release_year) } : null,
      item.upc ? { "@type": "PropertyValue", name: "UPC", value: item.upc } : null,
      item.exclusivity ? { "@type": "PropertyValue", name: "Exclusivity", value: item.exclusivity } : null,
      item.is_chase != null ? { "@type": "PropertyValue", name: "Chase", value: item.is_chase ? "Yes" : "No" } : null,
      item.is_exclusive != null
        ? { "@type": "PropertyValue", name: "Exclusive", value: item.is_exclusive ? "Yes" : "No" }
        : null,
    ].filter(Boolean),
  };

  const webPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${canonicalItem}#webpage`,
    url: canonicalItem,
    name: `${pageTitle} — Funko`,
    isPartOf: { "@type": "WebSite", name: site.name ?? "Legendary Collectibles", url: absBase() },
    primaryImageOfPage: coverAbs ? { "@type": "ImageObject", url: coverAbs } : undefined,
    mainEntity: { "@id": thingId },
  };

  // quick chips for flags (from both sources: item columns + flags table)
  const chips: string[] = [];
  if (item.number) chips.push(`#${String(item.number).trim()}`);
  if (truthy(item.is_chase) || flags?.chase) chips.push("Chase");
  if (truthy(item.is_exclusive) || item.exclusivity || false) chips.push("Exclusive");
  if (flags?.gitd || flags?.glow) chips.push("GITD");
  if (flags?.metallic) chips.push("Metallic");
  if (flags?.flocked) chips.push("Flocked");
  if (flags?.glitter) chips.push("Glitter");
  if (flags?.translucent) chips.push("Translucent");
  if (flags?.chrome) chips.push("Chrome");
  if (flags?.jumbo) chips.push("Jumbo");

  return (
    <section className="space-y-8">
      {/* JSON-LD */}
      <Script
        id="funko-webpage-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }}
      />
      <Script
        id="funko-breadcrumbs-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbsJsonLd) }}
      />
      <Script
        id="funko-thing-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(thingJsonLd) }}
      />

      {/* Visible breadcrumbs */}
      <nav className="text-xs text-white/70">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/" className="hover:underline">
            Home
          </Link>
          <span className="text-white/40">/</span>
          <Link href="/categories" className="hover:underline">
            Categories
          </Link>
          <span className="text-white/40">/</span>
          <Link href="/categories/funko/items" className="hover:underline">
            Funko
          </Link>
          <span className="text-white/40">/</span>
          <span className="text-white/90">{pageTitle}</span>
        </div>
      </nav>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
            <div className="relative mx-auto aspect-3/4 w-full max-w-md">
              {cover ? (
                <Image
                  src={cover}
                  alt={itemName}
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

            <div className="mt-3 flex flex-wrap gap-2">
              {chips.map((c) => (
                <Chip key={c}>{c}</Chip>
              ))}
            </div>

            {/* Owned counts summary (by variant_type) */}
            {Object.keys(ownedCounts).length ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-xs uppercase tracking-wide text-white/60">Owned</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(ownedCounts).map(([k, qty]) => (
                    <Chip key={k}>
                      {k}: {qty}
                    </Chip>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-white">{pageTitle}</h1>

                <div className="mt-1 text-sm text-white/80">
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

                {/* Pro-gated alerts */}
                {userId ? (
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
          </div>

          <MarketPrices category="funko" cardId={item.id} display={display} />

          <MarketValuePanel
            game={"funko" as const}
            canonicalId={item.id}
            title="Market Value"
            showDisclaimer
            canSeeRanges={planTier === "collector" || planTier === "pro"}
            canSeeConfidence={planTier === "pro"}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
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

        {/* Flag table (optional) */}
        {flags ? (
          <div className="mt-4 rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
            <div className="mb-2 text-sm font-semibold text-white">Variant Flags</div>
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
            {flags.notes ? <div className="mt-3 text-sm text-white/70">{flags.notes}</div> : null}
          </div>
        ) : null}
      </div>

      <TextBlock title="Description" text={item.description} />

      {item.extra ? (
        <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm text-white">
          <div className="mb-2 text-sm font-semibold">Extra</div>
          <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap wrap-break-word rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-white/80">
            {typeof item.extra === "string" ? item.extra : JSON.stringify(item.extra, null, 2)}
          </pre>
        </div>
      ) : null}

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
