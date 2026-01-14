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

import MarketValuePanel from "@/components/market/MarketValuePanel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ---------------- Types ---------------- */
type SearchParams = Record<string, string | string[] | undefined>;
type Currency = "USD" | "EUR";

type CardRow = {
  id: string;
  name: string | null;
  mana_cost: string | null;
  cmc: string | null;
  type_line: string | null;
  rarity: string | null;
  set_code: string | null;
  collector_number: string | null;
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
  return `${absBase()}${path.startsWith("/") ? path : `/${path}`}`;
}

function absMaybe(url?: string | null) {
  if (!url) return absUrl("/og-image.png");
  if (/^https?:\/\//i.test(url)) return url;
  return absUrl(url);
}

function readCurrency(sp: SearchParams): Currency {
  const raw = (Array.isArray(sp?.currency) ? sp.currency[0] : sp?.currency)?.toUpperCase();
  return raw === "EUR" ? "EUR" : "USD";
}

/* ---------------- Pricing helpers ---------------- */
function money(v?: string | null) {
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/* ---------------- Metadata (✅ canonical ignores currency param) ---------------- */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const p = await params;
  const foundId = decodeURIComponent(String(p.id ?? "")).trim();

  // No id -> don't index
  if (!foundId) {
    return {
      title: `MTG Cards | ${site.name}`,
      description: "Browse Magic: The Gathering cards.",
      alternates: { canonical: absUrl("/categories/mtg/cards") },
      robots: { index: false, follow: true },
    };
  }

  const metaRes = await db.execute<{
    name: string | null;
    type_line: string | null;
    rarity: string | null;
    collector_number: string | null;
    set_code: string | null;
    image_url: string | null;
  }>(sql`
    SELECT
      c.name,
      (c.payload->>'type_line') AS type_line,
      (c.payload->>'rarity') AS rarity,
      c.collector_number,
      c.set_code,
      COALESCE(
        (c.payload->'image_uris'->>'large'),
        (c.payload->'image_uris'->>'normal'),
        (c.payload->'card_faces'->0->'image_uris'->>'large'),
        (c.payload->'card_faces'->0->'image_uris'->>'normal')
      ) AS image_url
    FROM public.scryfall_cards_raw c
    WHERE c.id::text = ${foundId}
    LIMIT 1
  `);

  const m = metaRes.rows?.[0];
  const canonical = absUrl(`/categories/mtg/cards/${encodeURIComponent(foundId)}`);

  // Not found -> noindex (important!)
  if (!m) {
    return {
      title: `MTG Card Not Found | ${site.name}`,
      description: "We couldn’t find that MTG card.",
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
  }

  const title = `${m.name ?? foundId} — MTG Card | ${site.name}`;

  const descParts = [
    m.type_line ? `${m.type_line}.` : null,
    m.rarity ? `Rarity: ${m.rarity}.` : null,
    m.collector_number ? `#${m.collector_number}.` : null,
    m.set_code ? `Set: ${String(m.set_code).toUpperCase()}.` : null,
  ].filter(Boolean);

  const description =
    descParts.length ? descParts.join(" ") : `MTG card details for ${m.name ?? foundId}.`;

  const ogImage = absMaybe(m.image_url || site.ogImage || "/og-image.png");

  // Found -> indexable (this is the missing piece)
  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: site.name,
      type: "website",
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

/* ---------------- Market item ---------------- */
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
  const currency = readCurrency(sp);

  const foundId = decodeURIComponent(rawId ?? "").trim();
  if (!foundId) notFound();

  const { userId } = await auth();
  const canSave = !!userId;

  const rowRes = await db.execute<CardRow>(sql`
    SELECT
      c.id::text AS id,
      c.name,
      (c.payload->>'mana_cost') AS mana_cost,
      (c.payload->>'cmc') AS cmc,
      (c.payload->>'type_line') AS type_line,
      (c.payload->>'rarity') AS rarity,
      c.set_code,
      c.collector_number,
      (c.payload->>'oracle_text') AS oracle_text,
      COALESCE(
        (c.payload->'image_uris'->>'normal'),
        (c.payload->'image_uris'->>'large')
      ) AS image_url,

      s.usd::text AS usd,
      s.usd_foil::text AS usd_foil,
      s.usd_etched::text AS usd_etched,
      s.eur::text AS eur,
      s.tix::text AS tix,
      TO_CHAR(s.updated_at,'YYYY-MM-DD') AS price_updated,

      (
        SELECT mpc.price_cents
        FROM public.market_items mi
        JOIN public.market_prices_current mpc ON mpc.market_item_id = mi.id
        WHERE mi.game = 'mtg'
          AND mi.canonical_id = c.id::text
          AND mpc.source = 'ebay'
        LIMIT 1
      ) AS ebay_usd_cents,

      (
        SELECT mei.external_url
        FROM public.market_items mi
        JOIN public.market_item_external_ids mei ON mei.market_item_id = mi.id
        WHERE mi.game = 'mtg'
          AND mi.canonical_id = c.id::text
          AND mei.source = 'ebay'
        LIMIT 1
      ) AS ebay_url
    FROM public.scryfall_cards_raw c
    LEFT JOIN public.mtg_prices_scryfall_latest s ON s.scryfall_id = c.id
    WHERE c.id::text = ${foundId}
    LIMIT 1
  `);

  const card = rowRes.rows?.[0];
  if (!card) notFound();

  const hero = absMaybe(card.image_url);
  const serverEbayPrice = card.ebay_usd_cents ? card.ebay_usd_cents / 100 : null;

  const currentUsd =
    money(card.usd) ??
    (serverEbayPrice && Number.isFinite(serverEbayPrice) ? serverEbayPrice : null);

  /* ---------------- Plan + alerts (single fetch) ---------------- */
  let planTier: "free" | "collector" | "pro" = "free";
  let canUseAlerts = false;
  let marketItemId: string | null = null;

  if (userId) {
    const plan = await getUserPlan(userId);
    planTier = plan.id === "pro" ? "pro" : plan.id === "collector" ? "collector" : "free";
    canUseAlerts = canUsePriceAlerts(plan);

    if (canUseAlerts) {
      const mi = await getMarketItemForMtg(card.id);
      marketItemId = mi?.id ?? null;
    }
  }

  // Non-fatal eBay snapshot refresh
  try {
    await getLatestEbaySnapshot({ category: "mtg", cardId: card.id, segment: "all" });
  } catch {}

  const amazonLink = await getAffiliateLinkForCard({
    category: "mtg",
    cardId: card.id,
    marketplace: "amazon",
  });

  const canonical = absUrl(`/categories/mtg/cards/${encodeURIComponent(card.id)}`);

  return (
    <section className="space-y-8">
      {/* Image + header */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
        <div className="md:col-span-5">
          <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
            <div className="relative mx-auto aspect-[3/4] max-w-md">
              <Image src={hero} alt={card.name ?? card.id} fill unoptimized className="object-contain" />
            </div>
          </div>
        </div>

        <div className="md:col-span-7 space-y-4">
          <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
            <h1 className="text-2xl font-bold text-white">{card.name}</h1>
            <div className="mt-1 text-sm text-white/70">
              {[card.type_line, card.rarity, card.collector_number && `#${card.collector_number}`]
                .filter(Boolean)
                .join(" • ")}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <CardActions
                game="mtg"
                cardId={card.id}
                cardName={card.name ?? undefined}
                imageUrl={hero}
                canSave={canSave}
              />

              {userId ? (
                canUseAlerts && marketItemId ? (
                  <PriceAlertBell
                    game="mtg"
                    marketItemId={marketItemId}
                    label={card.name ?? card.id}
                    currentUsd={currentUsd}
                  />
                ) : (
                  <Link href="/pricing" className="text-xs text-sky-300 hover:underline">
                    🔔 Price alerts (Pro)
                  </Link>
                )
              ) : (
                <Link href="/sign-in" className="text-xs text-sky-300 hover:underline">
                  🔔 Sign in for alerts
                </Link>
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <CardEbayCTA card={{ id: card.id, name: card.name ?? "" }} game="Magic: The Gathering" />
              <CardAmazonCTA url={amazonLink?.url} label={card.name ?? undefined} />
            </div>
          </div>

          {/* Market Prices */}
          <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
            <h2 className="text-lg font-semibold text-white">Market Prices</h2>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>USD: ${money(card.usd)?.toFixed(2) ?? "—"}</div>
              <div>Foil: ${money(card.usd_foil)?.toFixed(2) ?? "—"}</div>
              <div>Etched: ${money(card.usd_etched)?.toFixed(2) ?? "—"}</div>
              <div>EUR: €{money(card.eur)?.toFixed(2) ?? "—"}</div>
            </div>
          </div>

          {/* ✅ Market Value (Estimated) */}
          <MarketValuePanel
            game="mtg"
            canonicalId={card.id}
            title="Market Value"
            showDisclaimer
            canSeeRanges={planTier === "collector" || planTier === "pro"}
            canSeeConfidence={planTier === "pro"}
          />
        </div>
      </div>

      {/* Rules text */}
      <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
        <h2 className="text-lg font-semibold text-white">Rules Text</h2>
        <div className="mt-2 whitespace-pre-wrap text-white/80">
          {card.oracle_text ?? "No rules text available."}
        </div>
      </div>

      <Link href="/categories/mtg/cards" className="text-sky-300 hover:underline">
        ← Back to MTG cards
      </Link>
    </section>
  );
}
