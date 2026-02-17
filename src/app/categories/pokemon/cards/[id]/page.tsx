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
import { type DisplayCurrency } from "@/lib/pricing";
import { site } from "@/config/site";

import type { PokemonVariants } from "@/components/pokemon/VariantChips";
import VariantPickerAdd from "@/components/pokemon/VariantPickerAdd";

import PriceAlertBell from "@/components/alerts/PriceAlertBell";
import { getUserPlan, canUsePriceAlerts } from "@/lib/plans";

import MarketValuePanel from "@/components/market/MarketValuePanel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Record<string, string | string[] | undefined>;

type CardMetaRow = {
  id: string;
  name: string | null;
  set_id: string | null;
  set_name: string | null;
  rarity: string | null;
  image_base: string | null; // e.g. https://assets.tcgdex.net/en/bw/bw1/103
};

type CardRow = {
  id: string;
  raw_json: any; // tcgdex JSON blob
};

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
   TCGdex image helpers

   TCGdex card "image" field is a base like:
   https://assets.tcgdex.net/en/swsh/swsh3/136

   Build final URL:
   {base}/{quality}.{extension}
   - quality: high | low
   - extension: webp (recommended), png, jpg
------------------------------------------------- */

type ImgQuality = "high" | "low";
type ImgExt = "webp" | "png" | "jpg";

function tcgdexCardImageUrl(imageBase: string, quality: ImgQuality = "high", ext: ImgExt = "webp") {
  const base = String(imageBase ?? "").trim().replace(/\/+$/, "");
  if (!base) return null;
  return `${base}/${quality}.${ext}`;
}

function bestImageFromRaw(raw: any): string | null {
  const imageBase = String(raw?.image ?? "").trim();
  if (!imageBase) return null;
  // main attraction on detail page => high.webp
  return tcgdexCardImageUrl(imageBase, "high", "webp");
}

function thumbImageFromRaw(raw: any): string | null {
  const imageBase = String(raw?.image ?? "").trim();
  if (!imageBase) return null;
  // list/preview => low.webp
  return tcgdexCardImageUrl(imageBase, "low", "webp");
}

/* ------------------------------------------------
   DB reads (tcgdex_cards + tcgdex_sets)
------------------------------------------------- */

async function getCardMeta(cardId: string): Promise<CardMetaRow | null> {
  noStore();

  // We only pluck what we need for SEO quickly using jsonb operators
  const row =
    (
      await db.execute<CardMetaRow>(sql`
        SELECT
          c.id::text AS id,
          NULLIF(c.raw_json->>'name','') AS name,
          NULLIF(c.raw_json#>>'{set,id}','') AS set_id,
          NULLIF(c.raw_json#>>'{set,name}','') AS set_name,
          NULLIF(c.raw_json->>'rarity','') AS rarity,
          NULLIF(c.raw_json->>'image','') AS image_base
        FROM public.tcgdex_cards c
        WHERE c.id::text = ${cardId}::text
        LIMIT 1
      `)
    ).rows?.[0] ?? null;

  return row ?? null;
}

async function getCardById(cardId: string): Promise<CardRow | null> {
  noStore();
  return (
    (
      await db.execute<CardRow>(sql`
        SELECT id::text AS id, raw_json
        FROM public.tcgdex_cards
        WHERE id::text = ${cardId}::text
        LIMIT 1
      `)
    ).rows?.[0] ?? null
  );
}

async function getMarketItemForPokemon(cardId: string): Promise<MarketItemRow | null> {
  noStore();
  return (
    (
      await db.execute<MarketItemRow>(sql`
        SELECT id, display_name
        FROM public.market_items
        WHERE game = 'pokemon'
          AND canonical_id::text = ${cardId}::text
        LIMIT 1
      `)
    ).rows?.[0] ?? null
  );
}

/* ------------------------------------------------
   Variants + owned counts
------------------------------------------------- */

async function getVariantsByCardId(cardId: string): Promise<PokemonVariants> {
  // Variants are inside tcgdex_cards.raw_json.variants
  const row = await getCardById(cardId);
  const v = row?.raw_json?.variants ?? null;

  if (!v || typeof v !== "object") return null;

  return {
    normal: v.normal === true,
    reverse: v.reverse === true,
    holo: v.holo === true,
    first_edition: v.firstEdition === true,
    w_promo: v.wPromo === true,
  };
}

async function getOwnedVariantCounts(userId: string | null, cardId: string) {
  if (!userId) return {};

  noStore();
  const res = await db.execute<{ variant_type: string | null; qty: number }>(sql`
    SELECT variant_type, COALESCE(SUM(quantity),0)::int AS qty
    FROM public.user_collection_items
    WHERE user_id = ${userId}
      AND game = 'pokemon'
      AND card_id = ${cardId}
    GROUP BY variant_type
  `);

  const out: Record<string, number> = {};
  for (const r of res.rows ?? []) {
    const key = String(r.variant_type ?? "normal").trim() || "normal";
    out[key] = Number(r.qty) || 0;
  }
  return out;
}

/* ------------------------------------------------
   Pricing helper from tcgdex raw_json.pricing.tcgplayer
------------------------------------------------- */

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseIsoDate(s: unknown): string | null {
  const v = String(s ?? "").trim();
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}

type OfferPick = {
  price: number | null;
  currency: string;
  url: string | null;
  updatedAtIso: string | null;
  variantType: string | null;
};

function pickBestTcgplayerOfferFromTcgdex(raw: any): OfferPick {
  // tcgdex example:
  // pricing.tcgplayer.unit = "USD"
  // pricing.tcgplayer.updated = "..."
  // pricing.tcgplayer.normal.marketPrice = 0.18
  // pricing.tcgplayer["reverse-holofoil"].marketPrice = 0.60
  const tp = raw?.pricing?.tcgplayer ?? null;

  if (!tp || typeof tp !== "object") {
    return { price: null, currency: "USD", url: null, updatedAtIso: null, variantType: null };
  }

  const currency = String(tp.unit ?? "USD").trim().toUpperCase() || "USD";
  const updatedAtIso = parseIsoDate(tp.updated);

  // Candidates in priority order
  const candidates: Array<{ key: string; obj: any }> = [];

  if (tp.normal) candidates.push({ key: "normal", obj: tp.normal });
  if (tp["reverse-holofoil"]) candidates.push({ key: "reverse-holofoil", obj: tp["reverse-holofoil"] });
  if (tp.holofoil) candidates.push({ key: "holofoil", obj: tp.holofoil });

  // Some cards might only have one odd key; scan all keys too.
  for (const k of Object.keys(tp)) {
    if (k === "unit" || k === "updated") continue;
    const obj = (tp as any)[k];
    if (obj && typeof obj === "object" && !candidates.find((c) => c.key === k)) {
      candidates.push({ key: k, obj });
    }
  }

  for (const c of candidates) {
    const price =
      toNum(c.obj?.marketPrice) ??
      toNum(c.obj?.midPrice) ??
      toNum(c.obj?.lowPrice) ??
      toNum(c.obj?.highPrice) ??
      null;

    if (price != null && price > 0) {
      return { price, currency, url: null, updatedAtIso, variantType: c.key };
    }
  }

  return { price: null, currency, url: null, updatedAtIso, variantType: null };
}

/* ------------------------------------------------
   UI helpers
------------------------------------------------- */

function readDisplay(sp: SearchParams): DisplayCurrency {
  const a = (Array.isArray(sp?.display) ? sp.display[0] : sp?.display) ?? "";
  const b = (Array.isArray(sp?.currency) ? sp.currency[0] : sp?.currency) ?? "";
  const v = (a || b).toUpperCase();
  return v === "USD" || v === "EUR" ? (v as DisplayCurrency) : "NATIVE";
}

function parseTextList(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map(String).map((x) => x.trim()).filter(Boolean);

  const s = String(v).trim();
  if (!s) return [];

  // handle legacy string forms if any
  if (s.startsWith("[") && s.endsWith("]")) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.map(String).filter(Boolean);
    } catch {}
  }

  if (s.startsWith("{") && s.endsWith("}")) {
    const inner = s.slice(1, -1).trim();
    if (!inner) return [];
    return inner
      .split(",")
      .map((x) => x.replace(/^"+|"+$/g, "").trim())
      .filter(Boolean);
  }

  if (s.includes(",")) {
    return s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }

  return [s];
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

function Chips({ label, values }: { label: string; values: string[] }) {
  if (!values.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="text-xs uppercase tracking-wide text-white/60">{label}</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {values.map((v) => (
          <span key={v} className="rounded-full border border-white/15 bg-white/10 px-2 py-1 text-xs text-white">
            {v}
          </span>
        ))}
      </div>
    </div>
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
      title: `Pokémon Cards | ${site.name}`,
      description: `Browse Pokémon cards, track prices, manage your collection, and shop on ${site.name}.`,
      alternates: { canonical: absUrl("/categories/pokemon/cards") },
      robots: { index: false, follow: true },
    };
  }

  const card = await getCardMeta(raw);

  const canonical = absUrl(`/categories/pokemon/cards/${encodeURIComponent(card?.id ?? raw)}`);

  if (!card) {
    return {
      title: `Pokémon Card Not Found | ${site.name}`,
      description: `We couldn’t find that Pokémon card. Browse cards and try again.`,
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
  }

  const name = card.name ?? card.id;
  const setPart = card.set_name ? ` (${card.set_name})` : "";
  const title = `${name}${setPart} — Price, Details & Collection | ${site.name}`;

  const description = [
    `View ${name} Pokémon card details`,
    card.rarity ? `rarity: ${card.rarity}` : null,
    card.set_name ? `set: ${card.set_name}` : null,
    "market prices and trends",
    "add to your collection",
  ]
    .filter(Boolean)
    .join(", ")
    .concat(".");

  const ogBase = card.image_base ? tcgdexCardImageUrl(card.image_base, "high", "webp") : null;
  const ogImage = absMaybe(ogBase || site.ogImage || "/og-image.png");

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

export default async function PokemonCardDetailPage({
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
  const canonical = absUrl(`/categories/pokemon/cards/${encodeURIComponent(rawId)}`);
  const hasUiCurrencyParams = sp?.display !== undefined || sp?.currency !== undefined;

  if (hasUiCurrencyParams) {
    redirect(`/categories/pokemon/cards/${encodeURIComponent(rawId)}`);
  }

  const display = readDisplay(sp);

  const [row, variants] = await Promise.all([getCardById(rawId), getVariantsByCardId(rawId)]);

  if (!row) {
    return (
      <section className="space-y-6">
        <Script
          id="card-notfound-jsonld"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebPage",
              url: canonical,
              name: "Pokémon Card Not Found",
            }),
          }}
        />
        <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
          <h1 className="text-2xl font-bold text-white">Card not found</h1>
          <p className="mt-2 break-all text-sm text-white/70">
            Looked up: <code>{rawId}</code>
          </p>
          <Link href="/categories/pokemon/cards" className="mt-4 inline-block text-sky-300 hover:underline">
            ← Back to cards
          </Link>
        </div>
      </section>
    );
  }

  const raw = row.raw_json ?? {};
  const cardId = String(raw?.id ?? row.id).trim() || row.id;

  const cardName = String(raw?.name ?? cardId).trim() || cardId;

  const setId = String(raw?.set?.id ?? "").trim() || null;
  const setName = String(raw?.set?.name ?? "").trim() || null;

  const rarity = String(raw?.rarity ?? "").trim() || null;
  const illustrator = String(raw?.illustrator ?? "").trim() || null;

  const hp = raw?.hp != null ? String(raw.hp) : null;
  const level = raw?.level != null ? String(raw.level) : null;

  const supertype = raw?.category != null ? String(raw.category) : null; // ex: "Trainer"
  const trainerType = raw?.trainerType != null ? String(raw.trainerType) : null; // ex: "Item"
  const stage = raw?.stage != null ? String(raw.stage) : null; // evolution stage-ish
  const regulation = raw?.regulationMark != null ? String(raw.regulationMark) : null;

  const evolvesFrom = raw?.evolveFrom != null ? String(raw.evolveFrom) : null;

  const types = parseTextList(raw?.types);
  const subtypes = parseTextList(raw?.suffix ? [raw.suffix] : []); // tcgdex "suffix" sometimes; keep harmless

  const retreat = raw?.retreat != null ? parseTextList(raw.retreat) : [];

  const effect = raw?.effect != null ? String(raw.effect) : null;
  const desc = raw?.description != null ? String(raw.description) : null;

  const cover = bestImageFromRaw(raw);
  const coverAbs = cover ? absMaybe(cover) : null;

  const pricesHref = `/categories/pokemon/cards/${encodeURIComponent(cardId)}/prices`;
  const setHref = setId ? `/categories/pokemon/sets/${encodeURIComponent(setId)}` : null;

  const ownedCounts = await getOwnedVariantCounts(userId ?? null, cardId);

  // Plan + alerts (single fetch)
  let planTier: "free" | "collector" | "pro" = "free";
  let canUseAlerts = false;
  let marketItemId: string | null = null;

  if (userId) {
    const plan = await getUserPlan(userId);
    planTier = plan.id === "pro" ? "pro" : plan.id === "collector" ? "collector" : "free";
    canUseAlerts = canUsePriceAlerts(plan);

    if (canUseAlerts) {
      const marketItem = await getMarketItemForPokemon(cardId);
      marketItemId = marketItem?.id ?? null;
    }
  }

  // tcgdex pricing snapshot (best offer for header line + bell "currentUsd")
  const offer = pickBestTcgplayerOfferFromTcgdex(raw);
  const marketUsd = offer.currency === "USD" && offer.price != null && offer.price > 0 ? offer.price : null;

  // JSON-LD: Breadcrumbs + WebPage + Card entity (NOT Product)
  const canonicalCard = absUrl(`/categories/pokemon/cards/${encodeURIComponent(cardId)}`);

  const breadcrumbsJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absUrl("/") },
      { "@type": "ListItem", position: 2, name: "Categories", item: absUrl("/categories") },
      { "@type": "ListItem", position: 3, name: "Pokémon", item: absUrl("/categories/pokemon/sets") },
      { "@type": "ListItem", position: 4, name: "Pokémon Cards", item: absUrl("/categories/pokemon/cards") },
      { "@type": "ListItem", position: 5, name: cardName, item: canonicalCard },
    ],
  };

  const cardEntityId = `${canonicalCard}#card`;

  const productJsonLd: any = {
    "@context": "https://schema.org",
    "@type": "Thing",
    "@id": cardEntityId,
    name: cardName,
    identifier: cardId,
    url: canonicalCard,
    image: coverAbs ? [coverAbs] : undefined,
    description: [
      rarity ? `Rarity: ${rarity}` : null,
      setName ? `Set: ${setName}` : null,
      illustrator ? `Illustrator: ${illustrator}` : null,
    ]
      .filter(Boolean)
      .join(" • "),
    additionalProperty: [
      rarity ? { "@type": "PropertyValue", name: "Rarity", value: rarity } : null,
      setName ? { "@type": "PropertyValue", name: "Set", value: setName } : null,
      setId ? { "@type": "PropertyValue", name: "Set ID", value: setId } : null,
      illustrator ? { "@type": "PropertyValue", name: "Illustrator", value: illustrator } : null,
      hp ? { "@type": "PropertyValue", name: "HP", value: hp } : null,
      supertype ? { "@type": "PropertyValue", name: "Category", value: supertype } : null,
      trainerType ? { "@type": "PropertyValue", name: "Trainer Type", value: trainerType } : null,
      stage ? { "@type": "PropertyValue", name: "Stage", value: stage } : null,
      evolvesFrom ? { "@type": "PropertyValue", name: "Evolve From", value: evolvesFrom } : null,
      regulation ? { "@type": "PropertyValue", name: "Regulation Mark", value: regulation } : null,
      types.length ? { "@type": "PropertyValue", name: "Types", value: types.join(", ") } : null,
      offer.variantType ? { "@type": "PropertyValue", name: "Variant Type (priced)", value: offer.variantType } : null,
    ].filter(Boolean),
  };

  const webPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${canonicalCard}#webpage`,
    url: canonicalCard,
    name: `${cardName} — Pokémon Card`,
    isPartOf: { "@type": "WebSite", name: site.name ?? "Legendary Collectibles", url: absBase() },
    primaryImageOfPage: coverAbs ? { "@type": "ImageObject", url: coverAbs } : undefined,
    mainEntity: { "@id": cardEntityId },
  };

  return (
    <section className="space-y-8">
      {/* JSON-LD */}
      <Script
        id="pokemon-card-webpage-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }}
      />
      <Script
        id="pokemon-card-breadcrumbs-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbsJsonLd) }}
      />
      <Script
        id="pokemon-card-entity-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
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
          <Link href="/categories/pokemon/sets" className="hover:underline">
            Pokémon
          </Link>
          <span className="text-white/40">/</span>
          <Link href="/categories/pokemon/cards" className="hover:underline">
            Cards
          </Link>
          <span className="text-white/40">/</span>
          <span className="text-white/90">{cardName}</span>
        </div>
      </nav>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
            <div className="relative mx-auto aspect-3/4 w-full max-w-md">
              {cover ? (
                <Image
                  src={cover}
                  alt={cardName}
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

            <div className="mt-3 flex flex-wrap gap-3 text-xs">
              {raw?.pricing?.tcgplayer ? (
                <a
                  className="text-sky-300 hover:underline"
                  href={`https://www.tcgplayer.com/search/pokemon/product?productLineName=pokemon&q=${encodeURIComponent(
                    cardName
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  TCGplayer →
                </a>
              ) : null}

              {raw?.pricing?.cardmarket ? (
                <a
                  className="text-sky-300 hover:underline"
                  href={`https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${encodeURIComponent(
                    cardName
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Cardmarket →
                </a>
              ) : null}
            </div>

            <VariantPickerAdd
              variants={variants}
              ownedCounts={ownedCounts}
              canSave={canSave}
              cardId={cardId}
              cardName={cardName}
              setName={setName ?? null}
              imageUrl={cover ?? thumbImageFromRaw(raw) ?? null}
            />
          </div>
        </div>

        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-white">{cardName}</h1>

                <div className="mt-1 text-sm text-white/80">
                  <span className="mr-3 text-white/60">ID:</span>
                  <span className="mr-4">{cardId}</span>

                  {rarity ? (
                    <>
                      <span className="mr-3 text-white/60">Rarity:</span>
                      <span className="mr-4">{rarity}</span>
                    </>
                  ) : null}

                  {illustrator ? (
                    <>
                      <span className="mr-3 text-white/60">Illustrator:</span>
                      <span>{illustrator}</span>
                    </>
                  ) : null}
                </div>

                <div className="mt-2 text-xs text-white/60">
                  {setName ? <span className="mr-3">Set: {setName}</span> : null}
                  {setId ? <span className="mr-3">Set ID: {setId}</span> : null}
                  {regulation ? <span>Reg: {regulation}</span> : null}
                </div>

                {setHref ? (
                  <div className="mt-3 text-sm">
                    <Link href={setHref} className="text-sky-300 hover:underline">
                      View this set →
                    </Link>
                  </div>
                ) : null}

                {offer.price != null && offer.price > 0 ? (
                  <div className="mt-3 text-sm text-white/80">
                    <span className="text-white/60">TCGplayer market:</span>{" "}
                    <span className="font-semibold text-white">
                      {offer.currency === "USD" ? "$" : ""}
                      {offer.price.toFixed(2)}{" "}
                      {offer.currency && offer.currency !== "USD" ? offer.currency : ""}
                    </span>
                    {offer.updatedAtIso ? <span className="text-white/50"> • updated {offer.updatedAtIso}</span> : null}
                    {offer.variantType ? (
                      <span className="text-white/50"> • {String(offer.variantType)}</span>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-sm">
                <CardActions
                  canSave={canSave}
                  game="pokemon"
                  cardId={cardId}
                  cardName={cardName}
                  setName={setName ?? undefined}
                  imageUrl={cover ?? undefined}
                />

                {/* ✅ Pro-gated alerts */}
                {userId ? (
                  canUseAlerts ? (
                    marketItemId ? (
                      <PriceAlertBell
                        game="pokemon"
                        marketItemId={marketItemId}
                        label={cardName}
                        currentUsd={marketUsd}
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

                <Link href={pricesHref} className="text-sky-300 hover:underline">
                  View prices →
                </Link>
              </div>
            </div>
          </div>

          {/* Your market system stays as-is (market_items + market_prices_current etc.) */}
          <MarketPrices category="pokemon" cardId={cardId} display={display} />

          <MarketValuePanel
            game="pokemon"
            canonicalId={cardId}
            title="Market Value"
            showDisclaimer
            canSeeRanges={planTier === "collector" || planTier === "pro"}
            canSeeConfidence={planTier === "pro"}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <h2 className="mb-3 text-lg font-semibold text-white">Card Details</h2>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Category" value={supertype} />
          <Field label="Trainer Type" value={trainerType} />
          <Field label="Stage" value={stage} />

          <Field label="HP" value={hp} />
          <Field label="Level" value={level} />
          <Field label="Evolve From" value={evolvesFrom} />

          <Field label="Set" value={setName} />
          <Field label="Set ID" value={setId} />
          <Field label="Regulation Mark" value={regulation} />

          <Chips label="Types" values={types} />
          <Chips label="Subtypes" values={subtypes} />
          <Chips label="Retreat" values={retreat} />
        </div>
      </div>

      <TextBlock title="Effect" text={effect} />
      <TextBlock title="Description" text={desc} />

      {raw ? (
        <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm text-white">
          <div className="mb-2 text-sm font-semibold">Raw (TCGdex)</div>
          <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap wrap-break-word rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-white/80">
            {JSON.stringify(raw, null, 2)}
          </pre>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/categories/pokemon/cards" className="text-sky-300 hover:underline">
          ← Back to cards
        </Link>
        {setHref ? (
          <Link href={setHref} className="text-sky-300 hover:underline">
            ← Back to set
          </Link>
        ) : null}
        <Link href={pricesHref} className="text-sky-300 hover:underline">
          → Prices
        </Link>
      </div>
    </section>
  );
}
