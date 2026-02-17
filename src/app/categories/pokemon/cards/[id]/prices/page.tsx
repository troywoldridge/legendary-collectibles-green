import "server-only";

import Link from "next/link";
import Script from "next/script";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

import type { Metadata } from "next";
import { site } from "@/config/site";
import { type DisplayCurrency, convert, formatMoney, getFx } from "@/lib/pricing";

import PriceHistoryChart from "@/components/charts/PriceHistoryChart";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Record<string, string | string[] | undefined>;

type CardCore = {
  id: string;
  raw_json: any;
};

type SnapshotRow = {
  as_of_date: string;
  currency: string;
  market_price_cents: number;
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
  const base = absBase();
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function s(v: unknown) {
  return String(v ?? "").trim();
}

function readDisplay(sp: SearchParams): DisplayCurrency {
  const a = (Array.isArray(sp?.display) ? sp.display[0] : sp?.display) ?? "";
  const b = (Array.isArray(sp?.currency) ? sp.currency[0] : sp?.currency) ?? "";
  const v = (a || b).toUpperCase();
  return v === "USD" || v === "EUR" ? (v as DisplayCurrency) : "NATIVE";
}

function withParam(baseHref: string, key: string, val: string) {
  const u = new URL(baseHref, "https://x/");
  u.searchParams.set(key, val);
  return u.pathname + (u.search ? u.search : "");
}

/**
 * tcgdex card images are stored as base like:
 *   https://assets.tcgdex.net/en/swsh/swsh3/136
 * You add /{quality}.{extension}
 * Example:
 *   https://assets.tcgdex.net/en/swsh/swsh3/136/high.webp
 */
function tcgdexCardImage(base: string | null | undefined, quality: "high" | "low", ext: "webp" | "png" | "jpg") {
  const b = s(base);
  if (!b) return null;
  return `${b.replace(/\/+$/, "")}/${quality}.${ext}`;
}

async function loadCardCore(cardId: string): Promise<CardCore | null> {
  return (
    (
      await db.execute<CardCore>(sql`
        SELECT id::text AS id, raw_json
        FROM public.tcgdex_cards
        WHERE id::text = ${cardId}::text
        LIMIT 1
      `)
    ).rows?.[0] ?? null
  );
}

async function loadHistory(cardId: string, currency: string, days = 90): Promise<SnapshotRow[]> {
  const cur = s(currency).toUpperCase() || "USD";
  const d = Math.max(1, Math.min(3650, Number(days) || 90));

  return (
    (
      await db.execute<SnapshotRow>(sql`
        SELECT
          as_of_date::text AS as_of_date,
          currency::text AS currency,
          market_price_cents::int AS market_price_cents
        FROM public.tcgdex_price_snapshots_daily
        WHERE card_id::text = ${cardId}::text
          AND currency::text = ${cur}::text
          AND as_of_date >= (CURRENT_DATE - (${d}::int))
        ORDER BY as_of_date ASC
      `)
    ).rows ?? []
  );
}

function pctChange(from: number | null, to: number | null): string | null {
  if (from == null || to == null || from === 0) return null;
  const p = ((to - from) / from) * 100;
  return `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const p = await params;
  const raw = decodeURIComponent(p.id ?? "").trim();
  const core = await loadCardCore(raw);

  const canonical = absUrl(`/categories/pokemon/cards/${encodeURIComponent(raw)}/prices`);

  if (!core) {
    return {
      title: `Pokémon Card Prices | ${site.name}`,
      description: `View Pokémon card price history and market trends on ${site.name}.`,
      alternates: { canonical },
      robots: { index: true, follow: true },
    };
  }

  const name = s(core.raw_json?.name) || core.id;
  const title = `Prices: ${name} — Pokémon Card Value & Trends | ${site.name}`;
  const desc = `View recent market prices and trends for ${name}. Daily snapshot history pulled from tcgdex pricing.`;

  const imgBase = s(core.raw_json?.image) || "";
  const og = tcgdexCardImage(imgBase, "high", "webp") || site.ogImage || absUrl("/og-image.png");

  return {
    title,
    description: desc,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      url: canonical,
      title,
      description: desc,
      siteName: site.name,
      images: og ? [{ url: og }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: desc,
      images: og ? [og] : [],
    },
  };
}

export default async function PokemonCardPricesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id: rawId } = await params;
  const sp = await searchParams;

  const display = readDisplay(sp);

  const cardId = decodeURIComponent(rawId ?? "").trim();
  const core = await loadCardCore(cardId);

  if (!core) {
    return (
      <section className="space-y-6">
        <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
          <h1 className="text-2xl font-bold text-white">Card not found</h1>
          <p className="mt-2 break-all text-sm text-white/70">
            Looked up: <code>{cardId}</code>
          </p>
          <Link href="/categories/pokemon/cards" className="mt-4 inline-block text-sky-300 hover:underline">
            ← Back to cards
          </Link>
        </div>
      </section>
    );
  }

  const name = s(core.raw_json?.name) || core.id;

  const baseDetail = `/categories/pokemon/cards/${encodeURIComponent(core.id)}`;
  const baseHref = `${baseDetail}/prices`;
  const canonical = absUrl(baseHref);

  // Determine "native" currency from tcgdex raw_json pricing if present
  const rawPricing = core.raw_json?.pricing ?? null;
  const tcgUnit = s(rawPricing?.tcgplayer?.unit).toUpperCase();
  const cmUnit = s(rawPricing?.cardmarket?.unit).toUpperCase();

  // Prefer tcgplayer unit if present; else cardmarket; else USD
  const nativeCurrency = (tcgUnit === "EUR" || tcgUnit === "USD") ? tcgUnit : (cmUnit === "EUR" ? "EUR" : "USD");

  // We store snapshots per currency. For now: use nativeCurrency points.
  const hist = await loadHistory(core.id, nativeCurrency, 180);

  const fx = getFx();

  const points = hist.map((r) => ({
    as_of_date: r.as_of_date,
    value: Number(r.market_price_cents || 0) / 100,
  }));

  const latest = points.length ? points[points.length - 1].value : null;
  const p7 = points.length >= 8 ? points[points.length - 8].value : null;
  const p30 = points.length >= 31 ? points[points.length - 31].value : null;

  // Display conversions for the metric strip (chart stays native)
  function showMoney(v: number | null) {
    if (v == null) return "—";
    if (display === "NATIVE") return formatMoney(v, nativeCurrency as any);
    const out = convert(v, nativeCurrency as any, display) ?? v;
    return formatMoney(out, display);
  }

  // -----------------------
  // JSON-LD (prices page can be Product, but keep it minimal)
  // -----------------------
  const imgBase = s(core.raw_json?.image);
  const cover = tcgdexCardImage(imgBase, "high", "webp") || tcgdexCardImage(imgBase, "high", "png") || null;

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absUrl("/") },
      { "@type": "ListItem", position: 2, name: "Categories", item: absUrl("/categories") },
      { "@type": "ListItem", position: 3, name: "Pokémon", item: absUrl("/categories/pokemon/sets") },
      { "@type": "ListItem", position: 4, name: "Pokémon Cards", item: absUrl("/categories/pokemon/cards") },
      { "@type": "ListItem", position: 5, name: name, item: absUrl(baseDetail) },
      { "@type": "ListItem", position: 6, name: "Prices", item: canonical },
    ],
  };

  const offer =
    latest != null && latest > 0
      ? {
          "@type": "Offer",
          url: canonical,
          priceCurrency: (nativeCurrency || "USD").toUpperCase(),
          price: latest.toFixed(2),
          availability: "https://schema.org/InStock",
          itemCondition: "https://schema.org/UsedCondition",
          seller: {
            "@type": "Organization",
            name: site.name ?? "Legendary Collectibles",
            url: absBase(),
          },
        }
      : null;

  const productJsonLd: any = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${absUrl(baseDetail)}#product`,
    name: name,
    sku: core.id,
    url: absUrl(baseDetail),
    image: cover ? [cover] : undefined,
    category: "Pokémon Trading Card",
    brand: { "@type": "Brand", name: "Pokémon" },
    ...(offer ? { offers: offer } : {}),
  };

  const webPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${canonical}#webpage`,
    url: canonical,
    name: `Prices: ${name}`,
    isPartOf: { "@type": "WebSite", name: site.name ?? "Legendary Collectibles", url: absBase() },
    mainEntity: { "@id": `${absUrl(baseDetail)}#product` },
  };

  return (
    <section className="space-y-8">
      <Script id="pokemon-prices-webpage-jsonld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }} />
      <Script id="pokemon-prices-breadcrumb-jsonld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <Script id="pokemon-prices-product-jsonld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />

      {/* Visible breadcrumbs */}
      <nav className="text-xs text-white/70">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/" className="hover:underline">Home</Link>
          <span className="text-white/40">/</span>
          <Link href="/categories" className="hover:underline">Categories</Link>
          <span className="text-white/40">/</span>
          <Link href="/categories/pokemon/sets" className="hover:underline">Pokémon</Link>
          <span className="text-white/40">/</span>
          <Link href="/categories/pokemon/cards" className="hover:underline">Cards</Link>
          <span className="text-white/40">/</span>
          <Link href={baseDetail} className="hover:underline">{name}</Link>
          <span className="text-white/40">/</span>
          <span className="text-white/90">Prices</span>
        </div>
      </nav>

      {/* Header + display toggles */}
      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Prices: {name}</h1>
            <div className="mt-1 text-sm text-white/70">
              Daily snapshot history • Native {nativeCurrency} • Display {display === "NATIVE" ? "Native" : display}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-md border border-white/20 bg-white/10 p-1 text-sm text-white">
              <span className="px-2">Display:</span>

              <Link
                href={withParam(baseHref, "display", "NATIVE")}
                className={`rounded px-2 py-1 ${display === "NATIVE" ? "bg-white/20" : "hover:bg-white/10"}`}
              >
                Native
              </Link>

              <Link
                href={withParam(baseHref, "display", "USD")}
                className={`ml-1 rounded px-2 py-1 ${display === "USD" ? "bg-white/20" : "hover:bg-white/10"}`}
              >
                USD
              </Link>

              <Link
                href={withParam(baseHref, "display", "EUR")}
                className={`ml-1 rounded px-2 py-1 ${display === "EUR" ? "bg-white/20" : "hover:bg-white/10"}`}
              >
                EUR
              </Link>
            </div>

            <Link href={baseDetail} className="text-sky-300 hover:underline">
              ← Card detail
            </Link>
          </div>
        </div>
      </div>

      {/* Metrics strip */}
      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm text-white">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs text-white/60">Latest</div>
            <div className="mt-1 text-lg font-semibold">{showMoney(latest)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs text-white/60">7d change</div>
            <div className="mt-1 text-lg font-semibold">{pctChange(p7, latest) ?? "—"}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs text-white/60">30d change</div>
            <div className="mt-1 text-lg font-semibold">{pctChange(p30, latest) ?? "—"}</div>
          </div>
        </div>

        <div className="mt-3 text-xs text-white/60">
          {display === "NATIVE"
            ? "Native market currency."
            : `Converted to ${display}${fx.usdToEur || fx.eurToUsd ? "" : " (no FX set; fallback used)"}`}

          <span className="text-white/40"> • </span>
          Chart is shown in native ({nativeCurrency}) for accuracy.
        </div>
      </div>

      {/* REAL chart */}
      <PriceHistoryChart
        title="Price History (Daily Snapshots)"
        points={points}
        currency={nativeCurrency}
      />

      {/* Fallback if no data */}
      {!points.length ? (
        <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm text-white">
          <div className="text-sm text-white/70">
            Not enough history yet. Once the daily snapshot cron runs, you’ll see the chart populate.
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/categories/pokemon/cards" className="text-sky-300 hover:underline">
          ← Back to cards
        </Link>
        <Link href={baseDetail} className="text-sky-300 hover:underline">
          ← Back to detail
        </Link>
      </div>
    </section>
  );
}
