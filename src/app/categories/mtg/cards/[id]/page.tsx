// src/app/categories/mtg/cards/[id]/page.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import Script from "next/script";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";

import { site } from "@/config/site";

import { getLatestEbaySnapshot } from "@/lib/ebay";
import EbayFallbackPrice from "@/components/EbayFallbackPrice";

import CardAmazonCTA from "@/components/CardAmazonCTA";
import { getAffiliateLinkForCard } from "@/lib/affiliate";
import CardEbayCTA from "@/components/CardEbayCTA";
import CardActions from "@/components/collection/CardActions";

import PriceAlertBell from "@/components/alerts/PriceAlertBell";
import { getUserPlan, canUsePriceAlerts } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ---------------- Types ---------------- */
type SearchParams = Record<string, string | string[] | undefined>;
type Currency = "USD" | "EUR";

type MtgMetaRow = {
  id: string;
  name: string | null;
  set_code: string | null;
  collector_number: string | null;
  image_url: string | null;
  rarity: string | null;
  type_line: string | null;
};

type CardRow = {
  id: string;
  name: string | null;
  printed_name: string | null;

  mana_cost: string | null;
  cmc: string | null;
  colors: string | null;
  color_identity: string | null;

  type_line: string | null;
  rarity: string | null;
  set_code: string | null;
  collector_number: string | null;
  oracle_id: string | null;
  layout: string | null;
  oracle_text: string | null;
  image_url: string | null;

  usd: string | null;
  usd_foil: string | null;
  usd_etched: string | null;
  eur: string | null;
  tix: string | null;
  price_updated: string | null;

  ebay_usd_cents: number | null;
  ebay_url: string | null;
};

type SetRow = {
  name: string | null;
  set_type: string | null;
  block: string | null;
  released_at: string | null;
};

type MarketItemRow = { id: string };

/* ---------------- URL helpers ---------------- */
function absBase() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
    site?.url?.replace(/\/+$/, "") ||
    "https://legendary-collectibles.com"
  );
}

function absUrl(path: string) {
  const base = absBase();
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function absMaybe(urlOrPath?: string | null) {
  if (!urlOrPath) return absUrl("/og-image.png");
  if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath;
  return absUrl(urlOrPath);
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

/* ---------------- ID parsing helpers ---------------- */
function parseSetAndNumber(raw: string): { set: string; num: string } | null {
  const cleaned = raw.replace(/[–—]/g, "-").replace(":", "-").replace("/", "-");
  const m = cleaned.match(/^([A-Za-z0-9]{2,10})-(.+)$/);
  if (!m) return null;
  return { set: m[1], num: decodeURIComponent(m[2]) };
}

function normalizeNumVariants(n: string) {
  const exact = n;
  const noZeros = n.replace(/^0+/, "");
  const lower = n.toLowerCase();
  return { exact, noZeros, lower };
}

async function resolveScryfallId(rawParam: string): Promise<string | null> {
  const idNoDashes = rawParam.replace(/-/g, "");

  const probe = await db.execute<{ id: string }>(sql`
    SELECT c.id::text AS id
    FROM public.scryfall_cards_raw c
    WHERE c.id::text = ${rawParam}
       OR REPLACE(c.id::text,'-','') = ${idNoDashes}
    LIMIT 1
  `);

  let foundId = probe.rows?.[0]?.id ?? null;

  if (!foundId) {
    const parsed = parseSetAndNumber(rawParam);
    if (parsed) {
      const set = parsed.set.toLowerCase();
      const { exact, noZeros, lower } = normalizeNumVariants(parsed.num);

      const p2 = await db.execute<{ id: string }>(sql`
        SELECT c.id::text AS id
        FROM public.scryfall_cards_raw c
        WHERE LOWER(c.set_code) = ${set}
          AND (
            c.collector_number::text = ${exact}
            OR ltrim(c.collector_number::text,'0') = ${noZeros}
            OR LOWER(c.collector_number::text) = ${lower}
          )
        LIMIT 1
      `);
      foundId = p2.rows?.[0]?.id ?? null;
    }
  }

  return foundId;
}

/* ---------------- Pricing helpers ---------------- */
async function getMarketItemForMtg(scryfallId: string): Promise<MarketItemRow | null> {
  return (
    (
      await db.execute<MarketItemRow>(sql`
        SELECT id::text AS id
        FROM public.market_items
        WHERE game = 'mtg'
          AND canonical_source = 'scryfall'
          AND canonical_id = ${scryfallId}::text
        LIMIT 1
      `)
    ).rows?.[0] ?? null
  );
}

function money(s?: string | null) {
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toFixed(2);
}

function fmtCurrency(nStr: string | null, currency: Currency) {
  const n = money(nStr);
  if (!n) return "—";
  return `${currency === "EUR" ? "€" : "$"}${n}`;
}

function tixNumber(v?: string | null): number | null {
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function fmtTix(v?: string | null) {
  const n = tixNumber(v);
  if (n == null) return "—";
  return n.toFixed(2);
}

/* ---------------- Meta fetch ---------------- */
async function getMtgMeta(foundId: string): Promise<MtgMetaRow | null> {
  return (
    (
      await db.execute<MtgMetaRow>(sql`
        SELECT
          c.id::text AS id,
          c.name,
          c.set_code,
          c.collector_number,
          (c.payload->>'type_line') AS type_line,
          (c.payload->>'rarity') AS rarity,
          COALESCE(
            (c.payload->'image_uris'->>'normal'),
            (c.payload->'image_uris'->>'large'),
            (c.payload->'image_uris'->>'small'),
            (c.payload->'card_faces'->0->'image_uris'->>'normal'),
            (c.payload->'card_faces'->0->'image_uris'->>'large'),
            (c.payload->'card_faces'->0->'image_uris'->>'small')
          ) AS image_url
        FROM public.scryfall_cards_raw c
        WHERE c.id::text = ${foundId}
        LIMIT 1
      `)
    ).rows?.[0] ?? null
  );
}

/**
 * Dynamic metadata for MTG card pages.
 * Canonical ALWAYS uses resolved UUID (foundId), not rawParam.
 */
export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const rawParam = decodeURIComponent(params.id ?? "").trim();

  if (!rawParam) {
    return {
      title: `MTG Card Details | ${site.name}`,
      description: `Browse Magic: The Gathering cards, prices, and collection tools on ${site.name}.`,
      robots: { index: false, follow: true },
    };
  }

  const foundId = await resolveScryfallId(rawParam);

  if (!foundId) {
    const canonical = absUrl(`/categories/mtg/cards/${encodeURIComponent(rawParam)}`);
    return {
      title: `MTG Card Details | ${site.name}`,
      description: `Browse Magic: The Gathering cards, prices, and collection tools on ${site.name}.`,
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
  }

  const canonical = absUrl(`/categories/mtg/cards/${encodeURIComponent(foundId)}`);
  const meta = await getMtgMeta(foundId);

  const name = meta?.name ?? foundId;

  const setPart =
    meta?.set_code && meta?.collector_number
      ? ` (${meta.set_code.toUpperCase()} #${meta.collector_number})`
      : meta?.set_code
        ? ` (${meta.set_code.toUpperCase()})`
        : "";

  const title = `${name}${setPart} — MTG Prices & Collection | ${site.name}`;

  const descBits = [
    meta?.type_line ? meta.type_line : null,
    meta?.rarity ? `Rarity: ${meta.rarity}` : null,
    "prices, eBay comps, and add-to-collection",
  ].filter(Boolean);

  const description = `${descBits.join(" • ")}.`;

  const ogImage = absMaybe(
    (meta?.image_url ?? "").replace(/^http:\/\//, "https://") || site.ogImage || "/og-image.png",
  );

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

/* ---------- Mana helpers ---------- */
function tokenizeMana(cost?: string | null): string[] {
  if (!cost) return [];
  const m = cost.match(/\{[^}]+\}/g) || [];
  return m.map((t) => t.slice(1, -1));
}
function nl2p(s?: string | null) {
  if (!s) return null;
  return s.split(/\n/g).map((line, i) => (
    <p key={i} className="mb-1">
      {line}
    </p>
  ));
}
function hexFor(sym: string) {
  switch (sym) {
    case "W":
      return "#f5f5f5";
    case "U":
      return "#3b82f6";
    case "B":
      return "#111827";
    case "R":
      return "#ef4444";
    case "G":
      return "#10b981";
    case "C":
      return "#6b7280";
    case "S":
      return "#94a3b8";
    default:
      return "#6b7280";
  }
}
function ManaSymbol({ t }: { t: string }) {
  const up = t.toUpperCase();

  if (up.includes("/")) {
    const [a, b] = up.split("/");
    const c1 = hexFor(a);
    const c2 = hexFor(b === "P" ? "B" : b);
    return (
      <span className="mana mana--hybrid" style={{ ["--c1" as any]: c1, ["--c2" as any]: c2 }} title={`Mana: ${up}`}>
        {up}
      </span>
    );
  }

  if (/^\d+$/.test(up)) return <span className="mana mana--num" title={`Mana: ${up}`}>{up}</span>;
  if (up === "X" || up === "Y" || up === "Z") return <span className="mana mana--var" title={`Mana: ${up}`}>{up}</span>;
  if (up === "T") return <span className="mana mana--sym" title="Tap">↷</span>;
  if (up === "Q") return <span className="mana mana--sym" title="Untap">↶</span>;

  return <span className={`mana mana--${up}`} title={`Mana: ${up}`}>{up}</span>;
}
function ManaCost({ cost }: { cost: string | null }) {
  const toks = tokenizeMana(cost);
  if (!toks.length) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {toks.map((t, i) => (
        <ManaSymbol key={`${t}-${i}`} t={t} />
      ))}
    </div>
  );
}

/* ---------------- Page ---------------- */
export default async function MtgCardDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id: rawId } = await params;
  const sp = await searchParams;

  const currency: Currency = readCurrency(sp);

  const rawParam = decodeURIComponent(rawId ?? "").trim();
  if (!rawParam) notFound();

  const { userId } = await auth();
  const canSave = !!userId;

  const foundId = await resolveScryfallId(rawParam);
  if (!foundId) notFound();

  // Load card row
  const rowRes = await db.execute<CardRow>(sql`
    SELECT
      c.id::text AS id,
      c.name,

      (c.payload->>'printed_name') AS printed_name,

      COALESCE(
        c.payload->>'mana_cost',
        c.payload->'card_faces'->0->>'mana_cost',
        c.payload->'card_faces'->1->>'mana_cost'
      ) AS mana_cost,

      (c.payload->>'cmc') AS cmc,
      (c.payload->'colors')::text AS colors,
      (c.payload->'color_identity')::text AS color_identity,
      (c.payload->>'type_line') AS type_line,
      (c.payload->>'rarity') AS rarity,

      c.set_code,
      c.collector_number,
      c.oracle_id::text AS oracle_id,
      c.layout,

      COALESCE(
        c.payload->>'oracle_text',
        c.payload->'card_faces'->0->>'oracle_text',
        c.payload->'card_faces'->1->>'oracle_text'
      ) AS oracle_text,

      COALESCE(
        (c.payload->'image_uris'->>'normal'),
        (c.payload->'image_uris'->>'large'),
        (c.payload->'image_uris'->>'small'),
        (c.payload->'card_faces'->0->'image_uris'->>'normal'),
        (c.payload->'card_faces'->0->'image_uris'->>'large'),
        (c.payload->'card_faces'->0->'image_uris'->>'small')
      ) AS image_url,

      COALESCE(e.effective_usd,        s.usd)::text        AS usd,
      COALESCE(e.effective_usd_foil,   s.usd_foil)::text   AS usd_foil,
      COALESCE(e.effective_usd_etched, s.usd_etched)::text AS usd_etched,
      COALESCE(e.effective_eur,        s.eur)::text        AS eur,
      COALESCE(e.effective_tix,        s.tix)::text        AS tix,
      COALESCE(
        TO_CHAR(e.effective_updated_at,'YYYY-MM-DD'),
        TO_CHAR(s.updated_at,'YYYY-MM-DD')
      ) AS price_updated,

      (
        SELECT mpc.price_cents
        FROM public.market_items mi
        JOIN public.market_prices_current mpc ON mpc.market_item_id = mi.id
        WHERE mi.game = 'mtg'
          AND mi.canonical_source = 'scryfall'
          AND mi.canonical_id = c.id::text
          AND mpc.source = 'ebay'
        LIMIT 1
      ) AS ebay_usd_cents,

      (
        SELECT mei.external_url
        FROM public.market_items mi
        JOIN public.market_item_external_ids mei ON mei.market_item_id = mi.id
        WHERE mi.game = 'mtg'
          AND mi.canonical_source = 'scryfall'
          AND mi.canonical_id = c.id::text
          AND mei.source = 'ebay'
        ORDER BY mei.updated_at DESC NULLS LAST
        LIMIT 1
      ) AS ebay_url

    FROM public.scryfall_cards_raw c
    LEFT JOIN public.mtg_prices_effective e       ON e.scryfall_id = c.id
    LEFT JOIN public.mtg_prices_scryfall_latest s ON s.scryfall_id = c.id
    WHERE c.id::text = ${foundId}
    LIMIT 1
  `);

  const card = rowRes.rows?.[0] ?? null;
  if (!card) notFound();

  // Set info
  const setRow =
    card.set_code
      ? (
          await db.execute<SetRow>(sql`
            SELECT
              name,
              set_type,
              block,
              COALESCE(TO_CHAR(released_at,'YYYY-MM-DD'), NULL) AS released_at
            FROM public.scryfall_sets
            WHERE LOWER(code) = LOWER(${card.set_code})
            LIMIT 1
          `)
        ).rows?.[0] ?? null
      : null;

  // Scryfall image
  const hero = (card.image_url ?? "").replace(/^http:\/\//, "https://") || null;
  const heroAbs = absMaybe(hero);

  // Primary-price presence
  const hasPrimaryPrice =
    !!money(card.usd) ||
    !!money(card.usd_foil) ||
    !!money(card.usd_etched) ||
    !!money(card.eur) ||
    tixNumber(card.tix) != null;

  // Server eBay fallback (from market tables)
  const serverEbayPrice = typeof card.ebay_usd_cents === "number" ? card.ebay_usd_cents / 100 : null;
  const serverEbayUrl = card.ebay_url || null;

  // currentUsd for alerts context
  const currentUsd = (() => {
    const s = money(card.usd);
    if (s) return Number(s);
    if (serverEbayPrice != null && Number.isFinite(serverEbayPrice)) return serverEbayPrice;
    return null;
  })();

  // Pro-gated alerts
  let canUseAlerts = false;
  let marketItemId: string | null = null;
  if (userId) {
    const plan = await getUserPlan(userId);
    canUseAlerts = canUsePriceAlerts(plan);

    if (canUseAlerts) {
      const marketItem = await getMarketItemForMtg(foundId);
      marketItemId = marketItem?.id ?? null;
    }
  }

  // non-fatal ebay snapshot updater (best-effort)
  try {
    await getLatestEbaySnapshot({ category: "mtg", cardId: card.id, segment: "all" });
  } catch (err) {
    console.error("[ebay snapshot failed]", err);
  }

  // Affiliate link
  const amazonLink = await getAffiliateLinkForCard({
    category: "mtg",
    cardId: card.id,
    marketplace: "amazon",
  });

  const setHref = card.set_code ? `/categories/mtg/sets/${encodeURIComponent(card.set_code)}` : null;
  const baseHref = `/categories/mtg/cards/${encodeURIComponent(card.id)}`;

  // JSON-LD
  const canonical = absUrl(baseHref);

  const breadcrumbsJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absUrl("/") },
      { "@type": "ListItem", position: 2, name: "Categories", item: absUrl("/categories") },
      { "@type": "ListItem", position: 3, name: "MTG Cards", item: absUrl("/categories/mtg/cards") },
      { "@type": "ListItem", position: 4, name: card.name ?? card.id, item: canonical },
    ],
  };

  const productJsonLd: any = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${canonical}#product`,
    name: card.name ?? card.id,
    sku: card.id,
    url: canonical,
    image: heroAbs ? [heroAbs] : undefined,
    category: "Magic: The Gathering Trading Card",
    brand: { "@type": "Brand", name: "Magic: The Gathering" },
    description: [
      card.type_line ? card.type_line : null,
      card.rarity ? `Rarity: ${card.rarity}` : null,
      card.set_code ? `Set: ${card.set_code.toUpperCase()}` : null,
      card.collector_number ? `Collector #: ${card.collector_number}` : null,
    ]
      .filter(Boolean)
      .join(" • "),
  };

  if (currentUsd != null && currentUsd > 0) {
    productJsonLd.offers = {
      "@type": "Offer",
      url: canonical,
      priceCurrency: "USD",
      price: currentUsd.toFixed(2),
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/UsedCondition",
      seller: {
        "@type": "Organization",
        name: site.name ?? "Legendary Collectibles",
        url: absBase(),
      },
    };
  }

  const webPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${canonical}#webpage`,
    url: canonical,
    name: `${card.name ?? card.id} — MTG Card`,
    isPartOf: { "@type": "WebSite", name: site.name ?? "Legendary Collectibles", url: absBase() },
    primaryImageOfPage: heroAbs ? { "@type": "ImageObject", url: heroAbs } : undefined,
    mainEntity: { "@id": `${canonical}#product` },
  };

  const ebayQ = [card.name ?? "", card.set_code || setRow?.name || "", card.collector_number || "", "MTG"]
    .filter(Boolean)
    .join(" ");

  return (
    <section className="space-y-8">
      {/* JSON-LD */}
      <Script
        id="mtg-card-webpage-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }}
      />
      <Script
        id="mtg-card-breadcrumbs-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbsJsonLd) }}
      />
      <Script
        id="mtg-card-product-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/categories/mtg/cards" className="text-sky-300 hover:underline" prefetch={false}>
          ← Back to MTG cards
        </Link>

        {/* Currency toggle */}
        <div className="rounded-md border border-white/20 bg-white/10 p-1 text-sm text-white">
          <span className="px-2">Currency:</span>
          <Link
            href={withParam(baseHref, "currency", "USD")}
            className={`rounded px-2 py-1 ${currency === "USD" ? "bg-white/20" : "hover:bg-white/10"}`}
            prefetch={false}
          >
            USD
          </Link>
          <Link
            href={withParam(baseHref, "currency", "EUR")}
            className={`ml-1 rounded px-2 py-1 ${currency === "EUR" ? "bg-white/20" : "hover:bg-white/10"}`}
            prefetch={false}
          >
            EUR
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
        {/* Image */}
        <div className="md:col-span-5">
          <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
            <div className="relative mx-auto w-full max-w-md" style={{ aspectRatio: "3 / 4" }}>
              {hero ? (
                <Image
                  src={hero}
                  alt={card.name ?? card.id}
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
          </div>
        </div>

        {/* Details */}
        <div className="md:col-span-7 space-y-4">
          <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-white/80">
                {setHref ? (
                  <>
                    Set:{" "}
                    <Link href={setHref} className="text-sky-300 hover:underline" prefetch={false}>
                      {setRow?.name ?? card.set_code}
                    </Link>
                  </>
                ) : null}
                {setRow?.released_at && <span className="ml-2">• Released: {setRow.released_at}</span>}
                {setRow?.set_type && <span className="ml-2">• {setRow.set_type}</span>}
                {setRow?.block && <span className="ml-2">• {setRow.block}</span>}
              </div>
            </div>

            <h1 className="mt-2 text-2xl font-bold text-white">{card.name ?? card.id}</h1>

            <div className="mt-1 text-sm text-white/70">
              {[
                card.type_line || undefined,
                card.cmc ? `CMC: ${card.cmc}` : undefined,
                card.rarity || undefined,
                card.collector_number ? `No. ${card.collector_number}` : undefined,
              ]
                .filter(Boolean)
                .join(" • ")}
            </div>

            <ManaCost cost={card.mana_cost} />

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <CardActions
                game="mtg"
                cardId={card.id}
                cardName={card.name ?? undefined}
                setName={setRow?.name ?? undefined}
                imageUrl={hero ?? undefined}
                canSave={canSave}
              />

              {/* ✅ Pro-gated alerts */}
              {userId ? (
                canUseAlerts ? (
                  marketItemId ? (
                    <PriceAlertBell
                      game="mtg"
                      marketItemId={marketItemId}
                      label={card.name ?? card.id}
                      currentUsd={currentUsd}
                    />
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
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <CardEbayCTA
                card={{
                  id: card.id,
                  name: card.name ?? "",
                  number: card.collector_number ?? undefined,
                  set_code: card.set_code ?? undefined,
                  set_name: setRow?.name ?? undefined,
                }}
                game="Magic: The Gathering"
              />
              <CardAmazonCTA url={amazonLink?.url} label={card.name ?? undefined} />
            </div>
          </div>

          {/* Market Prices */}
          <section className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                Market Prices{!hasPrimaryPrice && serverEbayPrice != null ? " (Scryfall missing — eBay available)" : ""}
              </h2>
              <div className="text-xs text-white/60">Updated {card.price_updated ?? "—"}</div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              <div>
                <div className="text-sm text-white/70">USD</div>
                <div className="text-lg font-semibold text-white">{fmtCurrency(card.usd, "USD")}</div>
              </div>
              <div>
                <div className="text-sm text-white/70">USD Foil</div>
                <div className="text-lg font-semibold text-white">{fmtCurrency(card.usd_foil, "USD")}</div>
              </div>
              <div>
                <div className="text-sm text-white/70">USD Etched</div>
                <div className="text-lg font-semibold text-white">{fmtCurrency(card.usd_etched, "USD")}</div>
              </div>
              <div>
                <div className="text-sm text-white/70">EUR</div>
                <div className="text-lg font-semibold text-white">{fmtCurrency(card.eur, "EUR")}</div>
              </div>
              <div>
                <div className="text-sm text-white/70">TIX</div>
                <div className="text-lg font-semibold text-white">{fmtTix(card.tix)}</div>
              </div>
            </div>

            {!hasPrimaryPrice && serverEbayPrice != null ? (
              <div className="mt-3 text-sm text-white/80">
                eBay snapshot: <span className="font-semibold text-white">${serverEbayPrice.toFixed(2)}</span>
                {serverEbayUrl ? (
                  <Link href={serverEbayUrl} className="ml-2 text-sky-300 underline" target="_blank" prefetch={false}>
                    View on eBay
                  </Link>
                ) : null}
              </div>
            ) : null}
          </section>

          <EbayFallbackPrice cardId={card.id} q={ebayQ} showWhen="missing" hasPrimaryPrice={hasPrimaryPrice} />

          {/* Details */}
          <section className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
            <h2 className="text-lg font-semibold text-white">Card Details</h2>
            <div className="mt-2 grid gap-2 text-sm text-white/85 sm:grid-cols-2">
              <div><span className="text-white/60">Layout:</span> {card.layout ?? "—"}</div>
              <div><span className="text-white/60">Oracle ID:</span> {card.oracle_id ?? "—"}</div>
              <div><span className="text-white/60">Set Code:</span> {card.set_code ?? "—"}</div>
              <div><span className="text-white/60">Collector #:</span> {card.collector_number ?? "—"}</div>
            </div>
          </section>

          {/* Rules text */}
          <section className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
            <h2 className="text-lg font-semibold text-white">Rules Text</h2>
            {card.oracle_text ? (
              <div className="mt-2 text-sm text-white/85">{nl2p(card.oracle_text)}</div>
            ) : (
              <div className="mt-2 text-sm text-white/60">
                No rules text available for this item (common for art cards, tokens, or special prints).
              </div>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
