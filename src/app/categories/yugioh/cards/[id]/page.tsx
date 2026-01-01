/* eslint-disable @typescript-eslint/no-unused-vars */
import "server-only";

import type { Metadata } from "next";
import Script from "next/script";
import Image from "next/image";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import YgoCardSearch from "@/components/ygo/YgoCardSearch";

/* Plan + collection */
import { auth } from "@clerk/nextjs/server";
import CardActions from "@/components/collection/CardActions";

/* ★ Marketplace CTAs */
import CardAmazonCTA from "@/components/CardAmazonCTA";
import { getAffiliateLinkForCard } from "@/lib/affiliate";
import CardEbayCTA from "@/components/CardEbayCTA";

import { site } from "@/config/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ---------------- Types ---------------- */
type CardRow = {
  id: string; // card_id
  name: string;
  type: string | null;
  desc: string | null;
  atk: number | null;
  def: number | null;
  level: number | null;
  race: string | null;
  attribute: string | null;
  archetype: string | null;
  ygoprodeck_url: string | null;
  linkval: number | null;
  scale: number | null;
  linkmarkers: string[] | null;
};

type ImageRow = { small: string | null; large: string | null };

type PriceRow = {
  tcgplayer: number | null;
  cardmarket: number | null;
  ebay: number | null;
  amazon: number | null;
  coolstuffinc: number | null;
};

type BanlistRow = { tcg: string | null; ocg: string | null; goat: string | null };

type SetEntry = {
  set_name: string;
  set_code: string | null;
  set_rarity: string | null;
  set_price: string | null;
};

/* ---------------- Helpers ---------------- */
function money(v: number | string | null | undefined) {
  if (v == null) return "—";
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (!Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function bestImage(imgs: ImageRow[]): string | null {
  if (!imgs?.length) return null;
  const first = imgs[0];
  return first.large || first.small || null;
}

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

function absMaybe(urlOrPath: string | null | undefined) {
  if (!urlOrPath) return absUrl("/og-image.png");
  if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath;
  return absUrl(urlOrPath);
}

function pickUsdPriceFromPrices(prices: PriceRow | null): number | null {
  if (!prices) return null;

  const candidates = [
    prices.tcgplayer,
    prices.ebay,
    prices.amazon,
    prices.coolstuffinc,
    prices.cardmarket, // last resort
  ];

  for (const v of candidates) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  }
  return null;
}

/* ---------------- Data loaders ---------------- */
async function getCard(param: string): Promise<{
  card: CardRow | null;
  images: ImageRow[];
  prices: PriceRow | null;
  banlist: BanlistRow | null;
  sets: SetEntry[];
}> {
  const id = decodeURIComponent(param).trim();

  const card =
    (
      await db.execute<CardRow>(sql`
        SELECT
          c.card_id AS id,
          c.name,
          c.type,
          c.desc,
          c.atk,
          c.def,
          c.level,
          c.race,
          c.attribute,
          c.archetype,
          c.ygoprodeck_url,
          c.linkval,
          c.scale,
          c.linkmarkers
        FROM ygo_cards c
        WHERE c.card_id = ${id}
        LIMIT 1
      `)
    ).rows?.[0] ?? null;

  const images =
    (
      await db.execute<ImageRow>(sql`
        SELECT i.image_url_small AS small, i.image_url AS large
        FROM ygo_card_images i
        WHERE i.card_id = ${id}
        ORDER BY (CASE WHEN i.image_url IS NOT NULL THEN 0 ELSE 1 END),
                 i.image_url_small NULLS LAST
        LIMIT 6
      `)
    ).rows ?? [];

  const prices =
    (
      await db.execute<PriceRow>(sql`
        SELECT
          p.tcgplayer_price    AS tcgplayer,
          p.cardmarket_price   AS cardmarket,
          p.ebay_price         AS ebay,
          p.amazon_price       AS amazon,
          p.coolstuffinc_price AS coolstuffinc
        FROM public.ygo_card_prices p
        WHERE p.card_id = ${id}
        LIMIT 1
      `)
    ).rows?.[0] ?? null;

  const banlist =
    (
      await db.execute<BanlistRow>(sql`
        SELECT b.ban_tcg AS tcg, b.ban_ocg AS ocg, b.ban_goat AS goat
        FROM public.ygo_card_banlist b
        WHERE b.card_id = ${id}
        LIMIT 1
      `)
    ).rows?.[0] ?? null;

  const sets =
    (
      await db.execute<SetEntry>(sql`
        SELECT s.set_name, s.set_code, s.set_rarity, s.set_price
        FROM public.ygo_card_sets s
        WHERE s.card_id = ${id}
        GROUP BY s.set_name, s.set_code, s.set_rarity, s.set_price
        ORDER BY s.set_name ASC, s.set_code ASC NULLS LAST
      `)
    ).rows ?? [];

  return { card, images, prices, banlist, sets };
}

/* ---------------- SEO: Dynamic Metadata ---------------- */
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const id = decodeURIComponent(params.id ?? "").trim();
  if (!id) {
    const canonical = absUrl("/categories/yugioh/cards");
    return {
      title: `Yu-Gi-Oh! Cards | ${site.name}`,
      description: "Browse Yu-Gi-Oh! cards, track prices, and manage your collection.",
      alternates: { canonical },
    };
  }

  const card =
    (
      await db.execute<{
        id: string;
        name: string;
        type: string | null;
        race: string | null;
        attribute: string | null;
        archetype: string | null;
      }>(sql`
        SELECT
          c.card_id AS id,
          c.name,
          c.type,
          c.race,
          c.attribute,
          c.archetype
        FROM public.ygo_cards c
        WHERE c.card_id = ${id}
        LIMIT 1
      `)
    ).rows?.[0] ?? null;

  const img =
    (
      await db.execute<{ large: string | null; small: string | null }>(sql`
        SELECT i.image_url AS large, i.image_url_small AS small
        FROM public.ygo_card_images i
        WHERE i.card_id = ${id}
        ORDER BY (CASE WHEN i.image_url IS NOT NULL THEN 0 ELSE 1 END),
                 i.image_url_small NULLS LAST
        LIMIT 1
      `)
    ).rows?.[0] ?? null;

  const canonical = absUrl(`/categories/yugioh/cards/${encodeURIComponent(id)}`);

  if (!card) {
    return {
      title: `Yu-Gi-Oh! Card Not Found | ${site.name}`,
      description: "We couldn’t find that Yu-Gi-Oh! card. Try searching by name or card ID.",
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
  }

  const ogImage = absMaybe(img?.large || img?.small || site.ogImage || "/og-image.png");
  const title = `${card.name} — Yu-Gi-Oh! Prices & Collection | ${site.name}`;

  const description = [
    card.type ? `Type: ${card.type}` : null,
    card.attribute ? `Attribute: ${card.attribute}` : null,
    card.race ? `Race: ${card.race}` : null,
    card.archetype ? `Archetype: ${card.archetype}` : null,
    "Track prices, add to collection, and shop listings.",
  ]
    .filter(Boolean)
    .join(" • ");

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

/* ---------------- Page ---------------- */
export default async function YugiohCardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { card, images, prices, banlist, sets } = await getCard(id);

  if (!card) {
    return (
      <section className="space-y-6">
        <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
          <div className="mb-2 text-sm font-semibold text-white">Find a card</div>
          <YgoCardSearch initialQuery={decodeURIComponent(id)} />
        </div>

        <h1 className="text-2xl font-bold text-white">Card not found</h1>
        <p className="text-white/80">We couldn’t find that Yu-Gi-Oh! card.</p>
        <Link href="/categories/yugioh/cards" className="text-sky-300 hover:underline">
          ← Back to cards
        </Link>
      </section>
    );
  }

  const canonical = absUrl(`/categories/yugioh/cards/${encodeURIComponent(card.id)}`);
  const baseCards = "/categories/yugioh/cards";
  const baseSets = "/categories/yugioh/sets";

  const cover = bestImage(images);
  const coverAbs = cover ? absMaybe(cover) : null;

  const firstSet = sets[0]?.set_name ?? null;

  // Amazon affiliate link (server-side)
  const amazonLink = await getAffiliateLinkForCard({
    category: "yugioh",
    cardId: card.id,
    marketplace: "amazon",
  });

  // Auth gate: signed-in users can save
  const { userId } = await auth();
  const canSave = !!userId;

  // SEO/JSON-LD Offer
  const offerPrice = pickUsdPriceFromPrices(prices);

  const breadcrumbsJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absUrl("/") },
      { "@type": "ListItem", position: 2, name: "Categories", item: absUrl("/categories") },
      { "@type": "ListItem", position: 3, name: "Yu-Gi-Oh!", item: absUrl(baseCards) },
      ...(firstSet
        ? [{ "@type": "ListItem", position: 4, name: firstSet, item: absUrl(`${baseSets}/${encodeURIComponent(firstSet)}`) }]
        : []),
      {
        "@type": "ListItem",
        position: firstSet ? 5 : 4,
        name: card.name,
        item: canonical,
      },
    ],
  };

  const productJsonLd: any = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${canonical}#product`,
    name: card.name,
    sku: card.id,
    url: canonical,
    image: coverAbs ? [coverAbs] : undefined,
    category: "Yu-Gi-Oh! Trading Card",
    brand: { "@type": "Brand", name: "Yu-Gi-Oh!" },
    description: [
      card.type ? `Type: ${card.type}` : null,
      card.attribute ? `Attribute: ${card.attribute}` : null,
      card.race ? `Race: ${card.race}` : null,
      card.archetype ? `Archetype: ${card.archetype}` : null,
    ]
      .filter(Boolean)
      .join(" • "),
    additionalProperty: [
      card.type ? { "@type": "PropertyValue", name: "Type", value: card.type } : null,
      card.attribute ? { "@type": "PropertyValue", name: "Attribute", value: card.attribute } : null,
      card.race ? { "@type": "PropertyValue", name: "Race", value: card.race } : null,
      card.archetype ? { "@type": "PropertyValue", name: "Archetype", value: card.archetype } : null,
      firstSet ? { "@type": "PropertyValue", name: "Set (example)", value: firstSet } : null,
    ].filter(Boolean),
  };

  if (offerPrice != null) {
    productJsonLd.offers = {
      "@type": "Offer",
      url: canonical,
      priceCurrency: "USD",
      price: offerPrice.toFixed(2),
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
    name: `${card.name} — Yu-Gi-Oh! Card`,
    isPartOf: { "@type": "WebSite", name: site.name ?? "Legendary Collectibles", url: absBase() },
    primaryImageOfPage: coverAbs ? { "@type": "ImageObject", url: coverAbs } : undefined,
    mainEntity: { "@id": `${canonical}#product` },
  };

  return (
    <section className="space-y-8">
      {/* JSON-LD */}
      <Script
        id="ygo-card-webpage-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }}
      />
      <Script
        id="ygo-card-breadcrumbs-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbsJsonLd) }}
      />
      <Script
        id="ygo-card-product-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />

      {/* Visible breadcrumbs */}
      <nav className="text-xs text-white/70">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/" className="hover:underline">Home</Link>
          <span className="text-white/40">/</span>
          <Link href="/categories" className="hover:underline">Categories</Link>
          <span className="text-white/40">/</span>
          <Link href={baseCards} className="hover:underline">Yu-Gi-Oh!</Link>
          {firstSet ? (
            <>
              <span className="text-white/40">/</span>
              <Link href={`${baseSets}/${encodeURIComponent(firstSet)}`} className="hover:underline">
                {firstSet}
              </Link>
            </>
          ) : null}
          <span className="text-white/40">/</span>
          <span className="text-white/90">{card.name}</span>
        </div>
      </nav>

      {/* Quick search at the top */}
      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <div className="mb-2 text-sm font-semibold text-white">Find another card</div>
        <YgoCardSearch initialQuery={card.name} />
      </div>

      {/* Top: image left, info right */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: card image */}
        <div className="lg:col-span-5">
          <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
            <div className="relative mx-auto w-full max-w-md" style={{ aspectRatio: "3 / 4" }}>
              {cover ? (
                <Image
                  src={cover}
                  alt={card.name}
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

        {/* Right: title + meta → CTAs → stats → actions → prices */}
        <div className="lg:col-span-7 space-y-4">
          {/* Main info + marketplace CTAs + stats */}
          <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-white">{card.name}</h1>

                <div className="mt-1 text-sm text-white/80">
                  {card.type ? <span className="mr-3">Type: {card.type}</span> : null}
                  {card.attribute ? <span className="mr-3">Attribute: {card.attribute}</span> : null}
                  {card.race ? <span className="mr-3">Race: {card.race}</span> : null}
                  {card.archetype ? <span>Archetype: {card.archetype}</span> : null}
                </div>

                {offerPrice != null ? (
                  <div className="mt-2 text-sm text-white/80">
                    <span className="text-white/60">Market reference:</span>{" "}
                    <span className="font-semibold text-white">${offerPrice.toFixed(2)}</span>
                  </div>
                ) : null}
              </div>
            </div>

            {/* CTAs */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <CardEbayCTA card={{ id: card.id, name: card.name, set_name: firstSet ?? null }} game="Yu-Gi-Oh!" variant="pill" />
              <CardAmazonCTA url={amazonLink?.url} label={card.name} />
            </div>

            {/* Stat grid */}
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-xs uppercase tracking-wide text-white/60">ATK / DEF</div>
                <div className="mt-1 text-lg font-semibold text-white">
                  {card.atk ?? "—"} / {card.def ?? "—"}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-xs uppercase tracking-wide text-white/60">Level / Scale / Link</div>
                <div className="mt-1 text-lg font-semibold text-white">
                  {card.level ?? 0} / {card.scale ?? 0} / {card.linkval ?? 0}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-xs uppercase tracking-wide text-white/60">Card ID</div>
                <div className="mt-1 text-lg font-semibold text-white">{card.id}</div>
              </div>
            </div>
          </div>

          {/* Collection & Wishlist actions */}
          <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
            <CardActions
              canSave={canSave}
              game="yugioh"
              cardId={card.id}
              cardName={card.name}
              setName={firstSet ?? undefined}
              imageUrl={cover ?? undefined}
            />
          </div>

          {/* Prices */}
          <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Market Prices</h2>
              <div className="text-xs text-white/60">USD reference (best available source)</div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-3">
                <PriceBox label="TCGplayer" value={prices?.tcgplayer} />
                <PriceBox label="eBay" value={prices?.ebay} />
                <PriceBox label="CoolStuffInc" value={prices?.coolstuffinc} />
              </div>
              <div className="space-y-3">
                <PriceBox label="Cardmarket" value={prices?.cardmarket} />
                <PriceBox label="Amazon" value={prices?.amazon} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sets */}
      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Sets</h2>
        </div>

        {sets.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-white/80">
            No set appearances recorded for this card.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sets.map((s) => {
              const href = `/categories/yugioh/sets/${encodeURIComponent(s.set_name)}`;
              return (
                <Link
                  key={`${s.set_name}::${s.set_code ?? ""}`}
                  href={href}
                  className="rounded-xl border border-white/10 bg-white/5 p-3 transition hover:border-white/20 hover:bg-white/10"
                >
                  <div className="text-sm font-medium text-white line-clamp-1">{s.set_name}</div>
                  <div className="mt-1 text-xs text-white/70">{s.set_rarity ?? "—"}</div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Card text / effect */}
      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <h2 className="text-lg font-semibold text-white">Card Text</h2>
        <p className="mt-2 whitespace-pre-wrap text-white/90">{card.desc || "—"}</p>

        {banlist && (
          <div className="mt-3 text-sm text-white/80">
            <span className="mr-3">Banlist (TCG): {banlist.tcg ?? "—"}</span>
            <span className="mr-3">OCG: {banlist.ocg ?? "—"}</span>
            <span>GOAT: {banlist.goat ?? "—"}</span>
          </div>
        )}
      </div>

      {/* Footer nav */}
      <div className="flex flex-wrap gap-4 text-sm">
        <Link href={baseCards} className="text-sky-300 hover:underline">
          ← Back to cards
        </Link>
        {firstSet && (
          <Link href={`/categories/yugioh/sets/${encodeURIComponent(firstSet)}`} className="text-sky-300 hover:underline">
            ← Back to set
          </Link>
        )}
      </div>
    </section>
  );
}

function PriceBox({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="text-sm font-medium text-white">{label}</div>
      <div className="text-white/80">Price</div>
      <div className="mt-1 text-lg font-semibold text-white">{money(value ?? null)}</div>
    </div>
  );
}
