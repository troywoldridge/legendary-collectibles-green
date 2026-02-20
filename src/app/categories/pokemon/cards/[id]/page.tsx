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
import { type DisplayCurrency } from "@/lib/pricing";
import { site } from "@/config/site";

import type { PokemonVariants } from "@/components/pokemon/VariantChips";
import VariantPickerAdd from "@/components/pokemon/VariantPickerAdd";

import PriceAlertBell from "@/components/alerts/PriceAlertBell";
import { getUserPlan, canUsePriceAlerts } from "@/lib/plans";

import MarketValuePanel from "@/components/market/MarketValuePanel";

import StickyQuickActionsClient from "@/components/pokemon/StickyQuickActionsClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Record<string, string | string[] | undefined>;

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
  const s = String(urlOrPath).trim();
  if (!s) return absUrl("/og-image.png");
  if (/^https?:\/\//i.test(s)) return s;
  return absUrl(s);
}

/* ------------------------------------------------
   TCGdex image helpers
------------------------------------------------- */

type ImgQuality = "high" | "low";
type ImgExt = "webp" | "png" | "jpg";

function tcgdexCardImageUrl(imageBase: string, quality: ImgQuality = "high", ext: ImgExt = "webp") {
  const base = String(imageBase ?? "").trim().replace(/\/+$/, "");
  if (!base) return null;
  return `${base}/${quality}.${ext}`;
}

function bestImageFromTcgdexRaw(raw: any): string | null {
  const imageBase = String(raw?.image ?? "").trim();
  if (!imageBase) return null;
  return tcgdexCardImageUrl(imageBase, "high", "webp");
}

function thumbImageFromTcgdexRaw(raw: any): string | null {
  const imageBase = String(raw?.image ?? "").trim();
  if (!imageBase) return null;
  return tcgdexCardImageUrl(imageBase, "low", "webp");
}

/* ------------------------------------------------
   TCGdex set asset helpers (logo/symbol)
------------------------------------------------- */

function withExtIfMissing(u: string, ext: ImgExt = "png") {
  const s = String(u ?? "").trim();
  if (!s) return null;

  if (/\.(png|webp|jpg|jpeg)$/i.test(s)) return s;
  if (/\/(logo|symbol)$/i.test(s)) return `${s}.${ext}`;

  return s;
}

function extractTcgdexSetAssets(rawSet: any): { logo: string | null; symbol: string | null } {
  const logoBase = rawSet?.logo ? String(rawSet.logo).trim() : "";
  const symbolBase = rawSet?.symbol ? String(rawSet.symbol).trim() : "";
  return {
    logo: logoBase ? withExtIfMissing(logoBase, "png") : null,
    symbol: symbolBase ? withExtIfMissing(symbolBase, "png") : null,
  };
}

/* ------------------------------------------------
   DB rows
------------------------------------------------- */

type TcgdexRow = {
  id: string;
  raw_json: any;
};

type TcgdexSetRow = {
  id: string;
  raw_json: any;
};

type LegacyRow = {
  id: string;
  name: string | null;
  set_id: string | null;
  set_name: string | null;
  rarity: string | null;
  number: string | null;
  small_image: string | null;
  large_image: string | null;
};

type VariantRow = {
  normal: boolean | null;
  reverse: boolean | null;
  holo: boolean | null;
  first_edition: boolean | null;
  w_promo: boolean | null;
};

type MarketItemRow = {
  id: string; // uuid
  display_name: string | null;
};

type CardSource = "tcgdex" | "legacy";

type CardResolved = {
  source: CardSource;
  id: string;
  name: string;
  setId: string | null;
  setName: string | null;
  rarity: string | null;
  number: string | null;
  cover: string | null;
  thumb: string | null;
  raw: any | null;
};

async function getTcgdexCard(cardId: string): Promise<TcgdexRow | null> {
  noStore();
  return (
    (
      await db.execute<TcgdexRow>(sql`
        SELECT id::text AS id, raw_json
        FROM public.tcgdex_cards
        WHERE id::text = ${cardId}::text
        LIMIT 1
      `)
    ).rows?.[0] ?? null
  );
}

async function getTcgdexSet(setId: string): Promise<TcgdexSetRow | null> {
  if (!setId) return null;
  noStore();
  return (
    (
      await db.execute<TcgdexSetRow>(sql`
        SELECT id::text AS id, raw_json
        FROM public.tcgdex_sets
        WHERE id::text = ${setId}::text
        LIMIT 1
      `)
    ).rows?.[0] ?? null
  );
}

async function getLegacyCard(cardId: string): Promise<LegacyRow | null> {
  noStore();
  return (
    (
      await db.execute<LegacyRow>(sql`
        SELECT
          c.id::text AS id,
          NULLIF(c.name,'') AS name,
          NULLIF(c.set_id,'') AS set_id,
          NULLIF(s.name,'') AS set_name,
          NULLIF(c.rarity,'') AS rarity,
          NULLIF(c.number,'') AS number,
          NULLIF(c.small_image,'') AS small_image,
          NULLIF(c.large_image,'') AS large_image
        FROM public.tcg_cards c
        LEFT JOIN public.tcg_sets s
          ON s.id = c.set_id
        WHERE c.id::text = ${cardId}::text
        LIMIT 1
      `)
    ).rows?.[0] ?? null
  );
}

async function getLegacyVariants(cardId: string): Promise<VariantRow | null> {
  noStore();
  return (
    (
      await db.execute<VariantRow>(sql`
        SELECT
          v.normal AS normal,
          v.reverse AS reverse,
          v.holo AS holo,
          v.first_edition AS first_edition,
          v.w_promo AS w_promo
        FROM public.tcg_card_variants v
        WHERE v.card_id::text = ${cardId}::text
        LIMIT 1
      `)
    ).rows?.[0] ?? null
  );
}

async function resolveCard(cardIdRaw: string): Promise<CardResolved | null> {
  noStore();

  const cardId = decodeURIComponent(String(cardIdRaw ?? "")).trim();
  if (!cardId) return null;

  const tcgdex = await getTcgdexCard(cardId);
  if (tcgdex) {
    const raw = tcgdex.raw_json ?? {};
    const id = String(raw?.id ?? tcgdex.id).trim() || tcgdex.id;
    const name = String(raw?.name ?? id).trim() || id;
    const setId = String(raw?.set?.id ?? "").trim() || null;
    const setName = String(raw?.set?.name ?? "").trim() || null;
    const rarity = String(raw?.rarity ?? "").trim() || null;
    const number = raw?.localId != null ? String(raw.localId) : null;

    const cover = bestImageFromTcgdexRaw(raw);
    const thumb = thumbImageFromTcgdexRaw(raw) ?? cover;

    return {
      source: "tcgdex",
      id,
      name,
      setId,
      setName,
      rarity,
      number,
      cover,
      thumb,
      raw,
    };
  }

  const legacy = await getLegacyCard(cardId);
  if (!legacy) return null;

// sourcery skip: use-object-destructuring
  const id = legacy.id;
  const name = String(legacy.name ?? id).trim() || id;

  const cover = legacy.large_image || legacy.small_image || null;
  const thumb = legacy.small_image || legacy.large_image || null;

  const raw = {
    id,
    name,
    rarity: legacy.rarity ?? undefined,
    number: legacy.number ?? undefined,
    set: legacy.set_id ? { id: legacy.set_id, name: legacy.set_name ?? undefined } : undefined,
    image: undefined,
    pricing: undefined,
  };

  return {
    source: "legacy",
    id,
    name,
    setId: legacy.set_id,
    setName: legacy.set_name,
    rarity: legacy.rarity,
    number: legacy.number,
    cover,
    thumb,
    raw,
  };
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

async function getVariantsByResolvedCard(resolved: CardResolved): Promise<PokemonVariants> {
  if (resolved.source === "tcgdex") {
    const v = resolved.raw?.variants ?? null;
    if (!v || typeof v !== "object") return null;

    return {
      normal: v.normal === true,
      reverse: v.reverse === true,
      holo: v.holo === true,
      first_edition: v.firstEdition === true,
      w_promo: v.wPromo === true,
    };
  }

  const row = await getLegacyVariants(resolved.id);
  if (!row) return null;

  return {
    normal: row.normal === true,
    reverse: row.reverse === true,
    holo: row.holo === true,
    first_edition: row.first_edition === true,
    w_promo: row.w_promo === true,
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
  const tp = raw?.pricing?.tcgplayer ?? null;

  if (!tp || typeof tp !== "object") {
    return { price: null, currency: "USD", url: null, updatedAtIso: null, variantType: null };
  }

  const currency = String(tp.unit ?? "USD").trim().toUpperCase() || "USD";
  const updatedAtIso = parseIsoDate(tp.updated);

  const candidates: Array<{ key: string; obj: any }> = [];

  if (tp.normal) candidates.push({ key: "normal", obj: tp.normal });
  if (tp["reverse-holofoil"]) candidates.push({ key: "reverse-holofoil", obj: tp["reverse-holofoil"] });
  if (tp.holofoil) candidates.push({ key: "holofoil", obj: tp.holofoil });

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
  const a = (Array.isArray((sp as any)?.display) ? (sp as any).display[0] : (sp as any)?.display) ?? "";
  const b = (Array.isArray((sp as any)?.currency) ? (sp as any).currency[0] : (sp as any)?.currency) ?? "";
  const v = String(a || b).toUpperCase();
  return v === "USD" || v === "EUR" ? (v as DisplayCurrency) : "NATIVE";
}

function parseTextList(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map(String).map((x) => x.trim()).filter(Boolean);

  const s = String(v).trim();
  if (!s) return [];

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

function ProfilePill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-white">
      <span className="text-white/60">{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </span>
  );
}

function ProfileStrip({
  hp,
  stage,
  rarity,
  setName,
  number,
  regulation,
  trainerType,
}: {
  hp: string | null;
  stage: string | null;
  rarity: string | null;
  setName: string | null;
  number: string | null;
  regulation: string | null;
  trainerType: string | null;
}) {
  const items: React.ReactNode[] = [];

  if (hp) items.push(<ProfilePill key="hp" label="HP" value={hp} />);
  if (stage) items.push(<ProfilePill key="stage" label="Stage" value={stage} />);
  if (rarity) items.push(<ProfilePill key="rarity" label="Rarity" value={rarity} />);
  if (trainerType) items.push(<ProfilePill key="trainer" label="Trainer" value={trainerType} />);
  if (setName) items.push(<ProfilePill key="set" label="Set" value={setName} />);
  if (number) items.push(<ProfilePill key="num" label="No." value={number} />);
  if (regulation) items.push(<ProfilePill key="reg" label="Reg" value={regulation} />);

  if (!items.length) return null;

  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="flex flex-wrap items-center gap-2">{items}</div>
    </div>
  );
}

/* ------------------------------------------------
   Metadata
------------------------------------------------- */

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
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

  const resolved = await resolveCard(raw);
  const canonical = absUrl(`/categories/pokemon/cards/${encodeURIComponent(resolved?.id ?? raw)}`);

  if (!resolved) {
    return {
      title: `Pokémon Card Not Found | ${site.name}`,
      description: `We couldn’t find that Pokémon card. Browse cards and try again.`,
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
  }

// sourcery skip: use-object-destructuring
  const name = resolved.name;
  const setPart = resolved.setName ? ` (${resolved.setName})` : "";
  const title = `${name}${setPart} — Price, Details & Collection | ${site.name}`;

  const description = [
    `View ${name} Pokémon card details`,
    resolved.rarity ? `rarity: ${resolved.rarity}` : null,
    resolved.setName ? `set: ${resolved.setName}` : null,
    "market prices and trends",
    "add to your collection",
  ]
    .filter(Boolean)
    .join(", ")
    .concat(".");

  const ogImage = absMaybe(resolved.cover || site.ogImage || "/og-image.png");

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

  const hasUiCurrencyParams = (sp as any)?.display !== undefined || (sp as any)?.currency !== undefined;
  if (hasUiCurrencyParams) {
    redirect(`/categories/pokemon/cards/${encodeURIComponent(rawId)}`);
  }

  const display = readDisplay(sp);

  const resolved = await resolveCard(rawId);
  const canonical = absUrl(`/categories/pokemon/cards/${encodeURIComponent(resolved?.id ?? rawId)}`);

  if (!resolved) {
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

  const cardId = resolved.id;
  const raw = resolved.raw ?? {};
  const cardName = resolved.name;

  const setId = resolved.setId;
  const setName = resolved.setName;

  const rarity = resolved.rarity;
  const number = resolved.number;

  const illustrator = raw?.illustrator != null ? String(raw.illustrator) : null;
  const hp = raw?.hp != null ? String(raw.hp) : null;
  const level = raw?.level != null ? String(raw.level) : null;
  const supertype = raw?.category != null ? String(raw.category) : null;
  const trainerType = raw?.trainerType != null ? String(raw.trainerType) : null;
  const stage = raw?.stage != null ? String(raw.stage) : null;
  const regulation = raw?.regulationMark != null ? String(raw.regulationMark) : null;
  const evolvesFrom = raw?.evolveFrom != null ? String(raw.evolveFrom) : null;

  const types = parseTextList(raw?.types);
  const subtypes = parseTextList(raw?.suffix ? [raw.suffix] : []);
  const retreat = raw?.retreat != null ? parseTextList(raw.retreat) : [];

  const effect = raw?.effect != null ? String(raw.effect) : null;
  const desc = raw?.description != null ? String(raw.description) : null;

  const cover = resolved.cover;
  const coverAbs = cover ? absMaybe(cover) : null;

  const pricesHref = `/categories/pokemon/cards/${encodeURIComponent(cardId)}/prices`;
  const setHref = setId ? `/categories/pokemon/sets/${encodeURIComponent(setId)}` : null;

  const [variants, ownedCounts, tcgdexSetRow] = await Promise.all([
    getVariantsByResolvedCard(resolved),
    getOwnedVariantCounts(userId ?? null, cardId),
    resolved.source === "tcgdex" && setId ? getTcgdexSet(setId) : Promise.resolve(null),
  ]);

  const tcgdexSetRaw = tcgdexSetRow?.raw_json ?? null;
  const setAssets = tcgdexSetRaw ? extractTcgdexSetAssets(tcgdexSetRaw) : { logo: null, symbol: null };
  const setLogoUrl = setAssets.logo;
  const setSymbolUrl = setAssets.symbol;

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

  const offer = resolved.source === "tcgdex" ? pickBestTcgplayerOfferFromTcgdex(raw) : null;
  const marketUsd = offer && offer.currency === "USD" && offer.price != null && offer.price > 0 ? offer.price : null;

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
      number ? `Number: ${number}` : null,
      resolved.source === "legacy" ? "Source: legacy catalog" : "Source: tcgdex",
    ]
      .filter(Boolean)
      .join(" • "),
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

  const pickerImage = cover ?? (resolved.source === "tcgdex" ? thumbImageFromTcgdexRaw(raw) : resolved.thumb) ?? null;

  return (
    <section className="space-y-8">
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

      <StickyQuickActionsClient
        title={cardName}
        subtitle={setName ? `${setName}${number ? ` • No. ${number}` : ""}` : number ? `No. ${number}` : null}
        jumps={[
          { href: "#prices", label: "Prices" },
          { href: "#market-value", label: "Market Value" },
          { href: "#attacks", label: "Attacks" },
          { href: "#details", label: "Details" },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <CardActions
              canSave={canSave}
              game="pokemon"
              cardId={cardId}
              cardName={cardName}
              setName={setName ?? undefined}
              imageUrl={cover ?? undefined}
            />

            {userId ? (
              canUseAlerts ? (
                marketItemId ? (
                  <PriceAlertBell game="pokemon" marketItemId={marketItemId} label={cardName} currentUsd={marketUsd} />
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
        }
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
          <span className="text-white/90">{cardName}</span>
        </div>
      </nav>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
            {setLogoUrl || setSymbolUrl || setName || number ? (
              <div className="mb-4 rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="flex flex-wrap items-center gap-3">
                  {setSymbolUrl ? (
                    <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-white/15 bg-black/30">
                      <Image
                        src={setSymbolUrl}
                        alt={`${setName ?? "Set"} symbol`}
                        fill
                        unoptimized
                        className="object-contain p-1"
                        sizes="40px"
                      />
                    </div>
                  ) : null}

                  {setLogoUrl ? (
                    <div className="relative h-10 w-[180px] max-w-full overflow-hidden rounded-xl border border-white/15 bg-black/30">
                      <Image
                        src={setLogoUrl}
                        alt={`${setName ?? "Set"} logo`}
                        fill
                        unoptimized
                        className="object-contain p-1"
                        sizes="180px"
                      />
                    </div>
                  ) : null}

                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    {setName ? <ProfilePill label="Set" value={setName} /> : null}
                    {number ? <ProfilePill label="No." value={number} /> : null}
                  </div>
                </div>
              </div>
            ) : null}

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

            <VariantPickerAdd
              variants={variants}
              ownedCounts={ownedCounts}
              canSave={canSave}
              cardId={cardId}
              cardName={cardName}
              setName={setName ?? null}
              imageUrl={pickerImage}
            />
          </div>
        </div>

        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-white">{cardName}</h1>

                <ProfileStrip
                  hp={hp}
                  stage={stage}
                  rarity={rarity}
                  setName={setName}
                  number={number}
                  regulation={regulation}
                  trainerType={trainerType}
                />

                <div className="mt-3 text-sm text-white/80">
                  <span className="mr-3 text-white/60">ID:</span>
                  <span className="mr-4 break-all">{cardId}</span>

                  {illustrator ? (
                    <>
                      <span className="mr-3 text-white/60">Illustrator:</span>
                      <span>{illustrator}</span>
                    </>
                  ) : null}
                </div>

                {setHref ? (
                  <div className="mt-3 text-sm">
                    <Link href={setHref} className="text-sky-300 hover:underline">
                      View this set →
                    </Link>
                  </div>
                ) : null}

                {offer && offer.price != null && offer.price > 0 ? (
                  <div className="mt-3 text-sm text-white/80">
                    <span className="text-white/60">TCGplayer market:</span>{" "}
                    <span className="font-semibold text-white">
                      {offer.currency === "USD" ? "$" : ""}
                      {offer.price.toFixed(2)} {offer.currency && offer.currency !== "USD" ? offer.currency : ""}
                    </span>
                    {offer.updatedAtIso ? <span className="text-white/50"> • updated {offer.updatedAtIso}</span> : null}
                    {offer.variantType ? <span className="text-white/50"> • {String(offer.variantType)}</span> : null}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-sm">
                <Link href={pricesHref} className="text-sky-300 hover:underline">
                  View prices →
                </Link>
              </div>
            </div>
          </div>

          <div id="prices" className="scroll-mt-28">
            <MarketPrices category="pokemon" cardId={cardId} display={display} />
          </div>

          <div id="market-value" className="scroll-mt-28">
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
      </div>

      <div id="details" className="scroll-mt-28 rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
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

      <div id="attacks" className="scroll-mt-28" />

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
