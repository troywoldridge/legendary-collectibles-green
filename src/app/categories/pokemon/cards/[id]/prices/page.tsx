import "server-only";

import Link from "next/link";
import Script from "next/script";
import type { Metadata } from "next";

import { site } from "@/config/site";
import { type DisplayCurrency, convert, formatMoney, getFx } from "@/lib/pricing";
import {
  resolvePokemonCard,
  getDailySnapshotHistory,
  groupSnapshotRowsByCurrency,
  formatDateLabel,
  s,
} from "@/lib/pokemon/pricing";

import PriceHistoryChart from "@/components/charts/PriceHistoryChart";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Record<string, string | string[] | undefined>;

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

function readDisplay(sp: SearchParams): DisplayCurrency {
  const a = (Array.isArray(sp?.display) ? sp.display[0] : sp?.display) ?? "";
  const b = (Array.isArray(sp?.currency) ? sp.currency[0] : sp?.currency) ?? "";
  const v = String(a || b).toUpperCase();
  return v === "USD" || v === "EUR" ? (v as DisplayCurrency) : "NATIVE";
}

function withParam(baseHref: string, key: string, val: string) {
  const u = new URL(baseHref, "https://x/");
  u.searchParams.set(key, val);
  return u.pathname + (u.search ? u.search : "");
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
  const resolved = await resolvePokemonCard(raw);

  const canonical = absUrl(`/categories/pokemon/cards/${encodeURIComponent(resolved?.id ?? raw)}/prices`);

  if (!resolved) {
    return {
      title: `Pokémon Card Prices | ${site.name}`,
      description: `View Pokémon card price history and market trends on ${site.name}.`,
      alternates: { canonical },
      robots: { index: true, follow: true },
    };
  }

  const name = s(resolved.name) || resolved.id;
  const title = `Prices: ${name} — Pokémon Card Value & Trends | ${site.name}`;
  const description = `View recent market prices and trends for ${name}. Daily snapshot history pulled from tcgdex_price_snapshots_daily.`;

  const og = resolved.cover || site.ogImage || absUrl("/og-image.png");

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
      images: og ? [{ url: og }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
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

  const requestedId = decodeURIComponent(rawId ?? "").trim();
  const resolved = await resolvePokemonCard(requestedId);

  if (!resolved) {
    return (
      <section className="space-y-6">
        <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
          <h1 className="text-2xl font-bold text-white">Card not found</h1>
          <p className="mt-2 break-all text-sm text-white/70">
            Looked up: <code>{requestedId}</code>
          </p>
          <Link href="/categories/pokemon/cards" className="mt-4 inline-block text-sky-300 hover:underline">
            ← Back to cards
          </Link>
        </div>
      </section>
    );
  }

  const name = s(resolved.name) || resolved.id;
  const baseDetail = `/categories/pokemon/cards/${encodeURIComponent(resolved.id)}`;
  const baseHref = `${baseDetail}/prices`;
  const canonical = absUrl(baseHref);

  const historyRows = await getDailySnapshotHistory([resolved.id, resolved.legacyId ?? null], 180);
  const byCurrency = groupSnapshotRowsByCurrency(historyRows);

  const usdRows = byCurrency.get("USD") ?? [];
  const eurRows = byCurrency.get("EUR") ?? [];

  const nativeCurrency: "USD" | "EUR" = usdRows.length ? "USD" : eurRows.length ? "EUR" : "USD";
  const nativeRows = nativeCurrency === "USD" ? usdRows : eurRows;
  const alternateRows = nativeCurrency === "USD" ? eurRows : usdRows;

  const points = nativeRows.map((r) => ({
    as_of_date: r.as_of_date,
    value: Number(r.market_price_cents || 0) / 100,
  }));

  const latest = points.length ? points[points.length - 1].value : null;
  const p7 = points.length >= 8 ? points[points.length - 8].value : null;
  const p30 = points.length >= 31 ? points[points.length - 31].value : null;

  const latestRow = nativeRows.length ? nativeRows[nativeRows.length - 1] : null;
  const altLatestRow = alternateRows.length ? alternateRows[alternateRows.length - 1] : null;

  const fx = getFx();

  function showMoney(v: number | null) {
    if (v == null) return "—";
    if (display === "NATIVE") return formatMoney(v, nativeCurrency);
    const out = convert(v, nativeCurrency, display) ?? v;
    return formatMoney(out, display);
  }

  const cover = resolved.cover || null;

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absUrl("/") },
      { "@type": "ListItem", position: 2, name: "Categories", item: absUrl("/categories") },
      { "@type": "ListItem", position: 3, name: "Pokémon", item: absUrl("/categories/pokemon/sets") },
      { "@type": "ListItem", position: 4, name: "Pokémon Cards", item: absUrl("/categories/pokemon/cards") },
      { "@type": "ListItem", position: 5, name, item: absUrl(baseDetail) },
      { "@type": "ListItem", position: 6, name: "Prices", item: canonical },
    ],
  };

  const offer =
    latest != null && latest > 0
      ? {
          "@type": "Offer",
          url: canonical,
          priceCurrency: nativeCurrency,
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
    name,
    sku: resolved.id,
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
      <Script
        id="pokemon-prices-webpage-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }}
      />
      <Script
        id="pokemon-prices-breadcrumb-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <Script
        id="pokemon-prices-product-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />

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
          <Link href="/categories/pokemon/sets" className="hover:underline">
            Pokémon
          </Link>
          <span className="text-white/40">/</span>
          <Link href="/categories/pokemon/cards" className="hover:underline">
            Cards
          </Link>
          <span className="text-white/40">/</span>
          <Link href={baseDetail} className="hover:underline">
            {name}
          </Link>
          <span className="text-white/40">/</span>
          <span className="text-white/90">Prices</span>
        </div>
      </nav>

      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Prices: {name}</h1>
            <div className="mt-1 text-sm text-white/70">
              Daily snapshot history • Source: tcgdex_price_snapshots_daily • Native {nativeCurrency} • Display{" "}
              {display === "NATIVE" ? "Native" : display}
            </div>
            <div className="mt-2 text-xs text-white/50">
              Lookup IDs: {[resolved.id, resolved.legacyId].filter(Boolean).join(" • ")}
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

      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 text-white backdrop-blur-sm">
        <div className="grid gap-3 sm:grid-cols-4">
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

          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs text-white/60">Latest snapshot date</div>
            <div className="mt-1 text-lg font-semibold">{formatDateLabel(latestRow?.as_of_date ?? null) ?? "—"}</div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-3 text-sm text-white/70">
          <div>
            Native latest:
            <span className="ml-1 font-medium text-white">
              {latestRow ? formatMoney(Number(latestRow.market_price_cents) / 100, nativeCurrency) : "—"}
            </span>
          </div>

          <div className="text-white/40">•</div>

          <div>
            Alternate currency latest:
            <span className="ml-1 font-medium text-white">
              {altLatestRow
                ? formatMoney(
                    Number(altLatestRow.market_price_cents) / 100,
                    String(altLatestRow.currency).toUpperCase() as "USD" | "EUR"
                  )
                : "—"}
            </span>
          </div>

          <div className="text-white/40">•</div>

          <div>
            Last updated:
            <span className="ml-1 font-medium text-white">
              {formatDateLabel(latestRow?.updated_at ?? null) ?? "—"}
            </span>
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

      <PriceHistoryChart title="Price History (Daily Snapshots)" points={points} currency={nativeCurrency} />

      {!points.length ? (
        <div className="rounded-2xl border border-white/15 bg-white/5 p-4 text-white backdrop-blur-sm">
          <div className="text-sm text-white/70">
            No daily snapshot history found yet in <code className="text-white/90">tcgdex_price_snapshots_daily</code> for
            this card.
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
