// src/app/categories/pokemon/cards/[id]/page.tsx
/* eslint-disable @typescript-eslint/no-unused-vars */
import "server-only";

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";

import CardActions from "@/components/collection/CardActions";
import MarketPrices from "@/components/MarketPrices";
import { type DisplayCurrency } from "@/lib/pricing";
import { site } from "@/config/site";

import type { PokemonVariants } from "@/components/pokemon/VariantChips";
import VariantPickerAdd from "@/components/pokemon/VariantPickerAdd";



export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Record<string, string | string[] | undefined>;

type CardRow = {
  id: string;
  name: string | null;

  supertype: string | null;
  subtypes: string | null;

  level: string | null;
  hp: string | null;
  types: string | null;

  evolves_from: string | null;
  evolves_to: string | null;

  rules: string | null;

  ancient_trait_name: string | null;
  ancient_trait_text: string | null;

  converted_retreat_cost: string | null;
  retreat_cost: string | null;

  set_id: string | null;
  set_name: string | null;
  series: string | null;
  printed_total: string | null;
  total: string | null;
  ptcgo_code: string | null;
  release_date: string | null;

  symbol_url: string | null;
  logo_url: string | null;

  regulation_mark: string | null;

  artist: string | null;
  rarity: string | null;
  flavor_text: string | null;
  national_pokedex_numbers: string | null;

  extra: string | null;

  small_image: string | null;
  large_image: string | null;

  tcgplayer_url: string | null;
  tcgplayer_updated_at: string | null;
  cardmarket_url: string | null;
  cardmarket_updated_at: string | null;
};

/* ------------------------------------------------
   SEO: Dynamic metadata (per card)
------------------------------------------------- */
type CardMetaRow = {
  id: string;
  name: string | null;
  rarity: string | null;
  set_name: string | null;
  series: string | null;
  release_date: string | null;
  small_image: string | null;
  large_image: string | null;
};

async function getCardMeta(cardId: string): Promise<CardMetaRow | null> {
  const row =
    (
      await db.execute<CardMetaRow>(sql`
        SELECT
          id,
          name,
          rarity,
          set_name,
          series,
          release_date,
          small_image,
          large_image
        FROM public.tcg_cards
        WHERE id = ${cardId}
        LIMIT 1
      `)
    ).rows?.[0] ?? null;

  return row;
}

function absUrl(path: string) {
  const base = (site?.url ?? "https://legendary-collectibles.com").replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function absMaybe(urlOrPath: string) {
  if (!urlOrPath) return absUrl("/og-image.png");
  if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath;
  return absUrl(urlOrPath);
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const raw = decodeURIComponent(params.id ?? "").trim();
  const card = await getCardMeta(raw);

  if (!card) {
    const canonical = absUrl(`/categories/pokemon/cards/${encodeURIComponent(raw)}`);
    return {
      title: `Pokémon Card Details | ${site.name}`,
      description: `Browse Pokémon cards, track prices, manage your collection, and shop on ${site.name}.`,
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
  }

  const name = card.name ?? card.id;
  const setPart = card.set_name ? ` (${card.set_name})` : "";
  const title = `${name}${setPart} — Details, Prices & Collection | ${site.name}`;

  const descriptionParts = [
    `View ${name} Pokémon card details`,
    card.rarity ? `rarity: ${card.rarity}` : null,
    card.set_name ? `set: ${card.set_name}` : null,
    `market price + trends`,
    `add to your collection`,
  ].filter(Boolean);

  const description = `${descriptionParts.join(", ")}.`;
  const canonical = absUrl(`/categories/pokemon/cards/${encodeURIComponent(card.id)}`);
  const ogImage = absMaybe(card.large_image || card.small_image || site.ogImage || "/og-image.png");

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

/* ------------------------------------------------
   Helpers
------------------------------------------------- */
function readDisplay(sp: SearchParams): DisplayCurrency {
  const a = (Array.isArray(sp?.display) ? sp.display[0] : sp?.display) ?? "";
  const b = (Array.isArray(sp?.currency) ? sp.currency[0] : sp?.currency) ?? "";
  const v = (a || b).toUpperCase();
  return v === "USD" || v === "EUR" ? (v as DisplayCurrency) : "NATIVE";
}

function bestImage(card: CardRow): string | null {
  return card.large_image || card.small_image || null;
}

function parseTextList(v: string | null): string[] {
  if (!v) return [];
  const s = v.trim();
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

async function getCardById(cardId: string): Promise<CardRow | null> {
  const row =
    (
      await db.execute<CardRow>(sql`
        SELECT
          id,
          name,
          supertype,
          subtypes,
          level,
          hp,
          types,
          evolves_from,
          evolves_to,
          rules,
          ancient_trait_name,
          ancient_trait_text,
          converted_retreat_cost,
          retreat_cost,
          set_id,
          set_name,
          series,
          printed_total,
          total,
          ptcgo_code,
          release_date,
          symbol_url,
          logo_url,
          regulation_mark,
          artist,
          rarity,
          flavor_text,
          national_pokedex_numbers,
          extra,
          small_image,
          large_image,
          tcgplayer_url,
          tcgplayer_updated_at,
          cardmarket_url,
          cardmarket_updated_at
        FROM public.tcg_cards
        WHERE id = ${cardId}
        LIMIT 1
      `)
    ).rows?.[0] ?? null;

  return row;
}

async function getVariantsByCardId(cardId: string): Promise<PokemonVariants> {
  const row =
    (
      await db.execute<{
        normal: boolean | null;
        reverse: boolean | null;
        holo: boolean | null;
        first_edition: boolean | null;
        w_promo: boolean | null;
      }>(sql`
        SELECT normal, reverse, holo, first_edition, w_promo
        FROM public.tcg_card_variants
        WHERE card_id = ${cardId}
        LIMIT 1
      `)
    ).rows?.[0] ?? null;

  // ✅ normalize to strict booleans (avoid null/driver weirdness)
  return row
    ? {
        normal: row.normal === true,
        reverse: row.reverse === true,
        holo: row.holo === true,
        first_edition: row.first_edition === true,
        w_promo: row.w_promo === true,
      }
    : null;
}

async function getOwnedVariantCounts(userId: string | null, cardId: string) {
  if (!userId) return {};

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

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="text-xs uppercase tracking-wide text-white/60">{label}</div>
      <div className="mt-1 break-words text-sm font-medium text-white">{value}</div>
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
          <span
            key={v}
            className="rounded-full border border-white/15 bg-white/10 px-2 py-1 text-xs text-white"
          >
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
   Page
------------------------------------------------- */

export default async function PokemonCardDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id: rawId } = await params;
  const sp = await searchParams;

  const { userId } = await auth();
  const canSave = !!userId;

  const display = readDisplay(sp);
  const id = decodeURIComponent(rawId ?? "").trim();

  const [card, variants] = await Promise.all([getCardById(id), getVariantsByCardId(id)]);

  if (!card) {
    return (
      <section className="space-y-6">
        <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
          <h1 className="text-2xl font-bold text-white">Card not found</h1>
          <p className="mt-2 break-all text-sm text-white/70">
            Looked up: <code>{id}</code>
          </p>
          <Link href="/categories/pokemon/cards" className="mt-4 inline-block text-sky-300 hover:underline">
            ← Back to cards
          </Link>
        </div>
      </section>
    );
  }

  const cover = bestImage(card);
  const pricesHref = `/categories/pokemon/cards/${encodeURIComponent(card.id)}/prices`;
  const ownedCounts = await getOwnedVariantCounts(userId ?? null, card.id);

  const types = parseTextList(card.types);
  const subtypes = parseTextList(card.subtypes);
  const retreat = parseTextList(card.retreat_cost);
  const pokedexNums = parseTextList(card.national_pokedex_numbers);

  return (
    <section className="space-y-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
            <div className="relative mx-auto w-full max-w-md" style={{ aspectRatio: "3 / 4" }}>
              {cover ? (
                <Image
                  src={cover}
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

            <div className="mt-3 flex flex-wrap gap-3 text-xs">
              {card.tcgplayer_url ? (
                <a className="text-sky-300 hover:underline" href={card.tcgplayer_url} target="_blank" rel="noreferrer">
                  TCGplayer →
                </a>
              ) : null}
              {card.cardmarket_url ? (
                <a className="text-sky-300 hover:underline" href={card.cardmarket_url} target="_blank" rel="noreferrer">
                  Cardmarket →
                </a>
              ) : null}
            </div>

            <VariantPickerAdd
              variants={variants}
              ownedCounts={ownedCounts}
              canSave={canSave}
              cardId={card.id}
              cardName={card.name ?? card.id}
              setName={card.set_name ?? null}
              imageUrl={cover ?? null}
            />
          </div>
        </div>

        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-white">{card.name ?? card.id}</h1>

                <div className="mt-1 text-sm text-white/80">
                  <span className="mr-3 text-white/60">ID:</span>
                  <span className="mr-4">{card.id}</span>

                  {card.rarity ? (
                    <>
                      <span className="mr-3 text-white/60">Rarity:</span>
                      <span className="mr-4">{card.rarity}</span>
                    </>
                  ) : null}

                  {card.artist ? (
                    <>
                      <span className="mr-3 text-white/60">Artist:</span>
                      <span>{card.artist}</span>
                    </>
                  ) : null}
                </div>

                <div className="mt-2 text-xs text-white/60">
                  {card.set_name ? <span className="mr-3">Set: {card.set_name}</span> : null}
                  {card.series ? <span className="mr-3">Series: {card.series}</span> : null}
                  {card.release_date ? <span className="mr-3">Release: {card.release_date}</span> : null}
                  {card.regulation_mark ? <span>Reg: {card.regulation_mark}</span> : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-sm">
                <CardActions
                  canSave={canSave}
                  game="pokemon"
                  cardId={card.id}
                  cardName={card.name ?? card.id}
                  setName={card.set_name ?? undefined}
                  imageUrl={cover ?? undefined}
                />

                <Link href={pricesHref} className="text-sky-300 hover:underline">
                  View prices →
                </Link>
              </div>
            </div>
          </div>

          <MarketPrices category="pokemon" cardId={card.id} display={display} />
        </div>
      </div>

      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <h2 className="mb-3 text-lg font-semibold text-white">Card Details</h2>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Supertype" value={card.supertype} />
          <Field label="HP" value={card.hp} />
          <Field label="Level" value={card.level} />

          <Field label="Evolves From" value={card.evolves_from} />
          <Field label="Evolves To" value={card.evolves_to} />
          <Field label="Converted Retreat" value={card.converted_retreat_cost} />

          <Field label="Set ID" value={card.set_id} />
          <Field label="Printed Total" value={card.printed_total} />
          <Field label="Total" value={card.total} />

          <Field label="PTCGO Code" value={card.ptcgo_code} />
          <Field label="Symbol URL" value={card.symbol_url} />
          <Field label="Logo URL" value={card.logo_url} />

          <Chips label="Types" values={types} />
          <Chips label="Subtypes" values={subtypes} />
          <Chips label="Retreat Cost" values={retreat} />
          <Chips label="National Pokédex #" values={pokedexNums} />
        </div>
      </div>

      <TextBlock
        title={card.ancient_trait_name ? `Ancient Trait: ${card.ancient_trait_name}` : "Ancient Trait"}
        text={card.ancient_trait_text}
      />
      <TextBlock title="Rules" text={card.rules} />
      <TextBlock title="Flavor Text" text={card.flavor_text} />

      {card.extra ? (
        <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm text-white">
          <div className="mb-2 text-sm font-semibold">Extra</div>
          <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-white/80">
            {card.extra}
          </pre>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/categories/pokemon/cards" className="text-sky-300 hover:underline">
          ← Back to cards
        </Link>
        <Link href={pricesHref} className="text-sky-300 hover:underline">
          → Prices
        </Link>
      </div>
    </section>
  );
}
