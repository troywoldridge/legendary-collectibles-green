/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

import Image from "next/image";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";

import MarketPrices from "@/components/MarketPrices";
import PriceSparkline from "@/components/PriceSparkline";

import { type DisplayCurrency, getFx } from "@/lib/pricing";
import { getVendorPricesForCard } from "@/lib/vendorPrices";
import { getLatestEbaySnapshot } from "@/lib/ebay";

import CardAmazonCTA from "@/components/CardAmazonCTA";
import CardEbayCTA from "@/components/CardEbayCTA";
import { getAffiliateLinkForCard } from "@/lib/affiliate";

import CardActions from "@/components/collection/CardActions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/* ---------------- Types ---------------- */
type SearchParams = Record<string, string | string[] | undefined>;
type RawRow = Record<string, any>;

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

  artist: string | null;
  rarity: string | null;
  flavor_text: string | null;

  small_image: string | null;
  large_image: string | null;

  tcgplayer_url: string | null;
  tcgplayer_updated_at: string | null;
  cardmarket_url: string | null;
  cardmarket_updated_at: string | null;
};

type LegalityRow = { format: string | null; legality: string | null };

type VendorKey = "ebay" | "amazon" | "coolstuffinc";
type VendorPrice = { value: number | null; currency: string; url: string | null };

type HoldingRow = {
  total_quantity: string | null;
  total_cost_cents: string | null;
  total_value_cents: string | null;
  first_added_at: string | null;
};

/* ---------------- Helpers ---------------- */
function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

/** Accept both ?display= and legacy ?currency= (USD|EUR) else NATIVE */
function readDisplay(sp: SearchParams): DisplayCurrency {
  const a = (first(sp?.display) ?? "").toUpperCase();
  const b = (first(sp?.currency) ?? "").toUpperCase();
  const v = (a || b).toUpperCase();
  return v === "USD" || v === "EUR" ? (v as DisplayCurrency) : "NATIVE";
}

function normalizeId(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, "");
}

function normalizeImg(u?: string | null): string | null {
  if (!u) return null;
  let s = String(u).trim();
  if (!s) return null;
  if (s.startsWith("//")) s = "https:" + s;
  s = s.replace(/^http:\/\//i, "https://");
  if (s.includes(" ")) s = s.replace(/ /g, "%20");
  try {
    return new URL(s).href;
  } catch {
    return s;
  }
}

function coerceText(v: any): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function splitList(s?: string | null): string[] {
  if (!s) return [];
  const t = s.trim();
  if (!t) return [];
  if ((t.startsWith("[") && t.endsWith("]")) || (t.startsWith("{") && t.endsWith("}"))) {
    try {
      const parsed = JSON.parse(t);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x)).filter(Boolean);
      if (parsed && typeof parsed === "object")
        return Object.values(parsed).map((x) => String(x)).filter(Boolean);
    } catch {
      // ignore
    }
  }
  return t
    .split(/[,;|]/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function fmtList(s?: string | null, sep = ", "): string {
  const a = splitList(s);
  return a.length ? a.join(sep) : "";
}

function mapRow(r: RawRow): CardRow {
  return {
    id: String(r.id),
    name: coerceText(r.name),
    supertype: coerceText(r.supertype),
    subtypes: coerceText(r.subtypes),
    level: coerceText(r.level),
    hp: coerceText(r.hp),
    types: coerceText(r.types),
    evolves_from: coerceText(r.evolves_from),
    evolves_to: coerceText(r.evolves_to),
    rules: coerceText(r.rules),
    ancient_trait_name: coerceText(r.ancient_trait_name),
    ancient_trait_text: coerceText(r.ancient_trait_text),
    converted_retreat_cost: coerceText(r.converted_retreat_cost),
    retreat_cost: coerceText(r.retreat_cost),

    set_id: (r["set.id"] ?? r.set_id ?? null) as string | null,
    set_name: (r["set.name"] ?? r.set_name ?? null) as string | null,
    series: (r["set.series"] ?? r.series ?? r.set_series ?? null) as string | null,
    printed_total: (r["set.printedTotal"] ?? r.printed_total ?? r.set_printed_total ?? null) as
      | string
      | null,
    total: (r["set.total"] ?? r.total ?? r.set_total ?? null) as string | null,
    ptcgo_code: (r["set.ptcgoCode"] ?? r.ptcgo_code ?? r.set_ptcgo_code ?? null) as string | null,
    release_date: (r["set.releaseDate"] ?? r.release_date ?? r.set_release_date ?? null) as
      | string
      | null,

    small_image: (r.small_image ?? r.image_small ?? r.imageSmall ?? null) as string | null,
    large_image: (r.large_image ?? r.image_large ?? r.imageLarge ?? null) as string | null,

    artist: coerceText(r.artist),
    rarity: coerceText(r.rarity),
    flavor_text: coerceText(r.flavor_text),

    tcgplayer_url: coerceText(r.tcgplayer_url),
    tcgplayer_updated_at: coerceText(r.tcgplayer_updated_at),
    cardmarket_url: coerceText(r.cardmarket_url),
    cardmarket_updated_at: coerceText(r.cardmarket_updated_at),
  };
}

function bestImg(c: CardRow) {
  return c.large_image || c.small_image || null;
}

/* ---------------- Data loaders ---------------- */
async function loadExact(id: string) {
  const rs = await db.execute<RawRow>(sql`SELECT * FROM tcg_cards WHERE id = ${id} LIMIT 1`);
  return rs.rows?.[0] ? mapRow(rs.rows[0]) : null;
}

async function loadCaseInsensitive(id: string) {
  const rs = await db.execute<RawRow>(sql`
    SELECT * FROM tcg_cards
    WHERE LOWER(id) = LOWER(${id})
    LIMIT 1
  `);
  return rs.rows?.[0] ? mapRow(rs.rows[0]) : null;
}

async function loadNormalized(id: string) {
  const wanted = normalizeId(id);
  const rs = await db.execute<RawRow>(sql`
    SELECT * FROM tcg_cards
    WHERE LOWER(
      REPLACE(
        REPLACE(
          REPLACE(
            REPLACE(id,'–','-'),
            '—','-'
          ),
          '−','-'
        ),
        ' ',
        ''
      )
    ) = ${wanted}
    LIMIT 1
  `);
  return rs.rows?.[0] ? mapRow(rs.rows[0]) : null;
}

async function loadCardById(wanted: string) {
  let card = await loadExact(wanted);
  if (card) return { card, path: "exact" as const };

  card = await loadCaseInsensitive(wanted);
  if (card) return { card, path: "lowercase" as const };

  card = await loadNormalized(wanted);
  if (card) return { card, path: "normalized" as const };

  return { card: null as CardRow | null, path: "miss" as const };
}

/* ---------------- Page ---------------- */
export default async function PokemonCardDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id?: string | string[] }>;
  searchParams: Promise<SearchParams>;
}) {
  noStore();

  const p = await params;
  const sp = await searchParams;

  const rawId = Array.isArray(p?.id) ? p.id[0] : p?.id;
  const wanted = decodeURIComponent(String(rawId ?? "")).trim();

  const display = readDisplay(sp);
  const debug = first(sp?.debug) === "1";

  const { card, path } = await loadCardById(wanted);

  if (!card) {
    return (
      <section className="space-y-4">
        {debug && (
          <pre className="whitespace-pre-wrap rounded-md border border-yellow-500/30 bg-yellow-500/10 p-2 text-xs text-yellow-200">
            {JSON.stringify(
              { wanted, normalized: normalizeId(wanted), pathTried: path },
              null,
              2,
            )}
          </pre>
        )}

        <h1 className="text-2xl font-bold text-white">Card not found</h1>
        <p className="break-all text-sm text-white/70">
          Tried ID: <code>{wanted}</code>
        </p>

        <div className="flex gap-4">
          <Link href="/categories/pokemon/cards" className="text-sky-300 hover:underline">
            ← Back to all cards
          </Link>
          <Link href="/categories/pokemon/sets" className="text-sky-300 hover:underline">
            ← Browse sets
          </Link>
        </div>
      </section>
    );
  }

  const hero = normalizeImg(bestImg(card));
  const setHref = card.set_id
    ? `/categories/pokemon/sets/${encodeURIComponent(String(card.set_id))}`
    : card.set_name
    ? `/categories/pokemon/sets/${encodeURIComponent(String(card.set_name))}`
    : null;

  const chipsTypes = splitList(card.types);
  const chipsSubtypes = splitList(card.subtypes);
  const rulesList = splitList(card.rules);
  const evoTo = splitList(card.evolves_to);

  const fx = getFx();

  // Auth
  const { userId } = await auth();
  const canSave = !!userId;

  // Amazon affiliate link (server)
  const amazonLink = await getAffiliateLinkForCard({
    category: "pokemon",
    cardId: card.id,
    marketplace: "amazon",
  });

  // eBay snapshot (server)
  const ebay = await getLatestEbaySnapshot({
    category: "pokemon",
    cardId: card.id,
    segment: "all",
  });

  // Legalities (by set)
  const legalities: LegalityRow[] =
    card.set_id
      ? (
          await db.execute<LegalityRow>(sql`
            SELECT format, legality
            FROM tcg_sets_legalities
            WHERE set_id = ${card.set_id}
            ORDER BY format ASC
          `)
        ).rows ?? []
      : [];

  // Vendor prices
  const rawVendors = await getVendorPricesForCard("pokemon", card.id, [
    "ebay",
    "amazon",
    "coolstuffinc",
  ]);

  const baseVendors = (rawVendors ?? {}) as Record<VendorKey, VendorPrice>;

  // If vendor eBay is missing, we’ll backfill from snapshot
  const vendors: Record<VendorKey, VendorPrice> =
    !baseVendors.ebay || baseVendors.ebay.value == null
      ? {
          ...baseVendors,
          ebay: {
            value: ebay?.price_cents != null ? ebay.price_cents / 100 : null,

            currency: "USD",
            url: baseVendors.ebay?.url ?? null,
          },
        }
      : baseVendors;

  if (!vendors.ebay || vendors.ebay.value == null) {
    vendors.ebay = {
      value: ebay?.price_cents != null ? ebay.price_cents / 100 : null,

      currency: "USD",
      url: vendors.ebay?.url ?? null,
    };
  }

  // History existence checks
  const hasTcgHistory =
    (await db.execute(sql`
      SELECT 1
      FROM tcg_card_prices_tcgplayer
      WHERE card_id = ${card.id}
      LIMIT 1
    `)).rows.length > 0;

  const hasCmkHistory =
    (await db.execute(sql`
      SELECT 1
      FROM tcg_card_prices_cardmarket
      WHERE card_id = ${card.id}
      LIMIT 1
    `)).rows.length > 0;

  // Holdings
  let holdingSummary:
    | {
        quantity: number;
        totalCostCents: number;
        totalValueCents: number;
        firstAddedAt: string | null;
      }
    | null = null;

  if (userId) {
    const res = await db.execute<HoldingRow>(sql`
      SELECT
        COALESCE(SUM(quantity), 0)::text AS total_quantity,
        COALESCE(SUM(COALESCE(cost_cents, 0) * quantity), 0)::text AS total_cost_cents,
        COALESCE(SUM(COALESCE(last_value_cents, 0) * quantity), 0)::text AS total_value_cents,
        MIN(created_at)::text AS first_added_at
      FROM user_collection_items
      WHERE user_id = ${userId}
        AND card_id = ${card.id}
    `);

    const row = res.rows?.[0];
    if (row && row.total_quantity && Number(row.total_quantity) > 0) {
      holdingSummary = {
        quantity: Number(row.total_quantity) || 0,
        totalCostCents: Number(row.total_cost_cents ?? 0) || 0,
        totalValueCents: Number(row.total_value_cents ?? 0) || 0,
        firstAddedAt: row.first_added_at,
      };
    }
  }

  const profitCents =
    holdingSummary != null
      ? holdingSummary.totalValueCents - holdingSummary.totalCostCents
      : null;

  const profitPct =
    holdingSummary && holdingSummary.totalCostCents > 0 && profitCents != null
      ? (profitCents / holdingSummary.totalCostCents) * 100
      : null;

  // Money helpers
  const moneyFromUsdCents = (cents?: number | null) => {
    if (cents == null) return "—";
    if (display === "EUR" && fx.usdToEur) {
      const eur = (cents / 100) * fx.usdToEur;
      return `€${eur.toFixed(2)}`;
    }
    return `$${(cents / 100).toFixed(2)}`;
  };

  const showVendorPrice = (v?: VendorPrice) => {
    if (!v || v.value == null) return "—";

    if (display === "EUR") {
      if (v.currency === "EUR") return `€${v.value.toFixed(2)}`;
      if (v.currency === "USD" && fx.usdToEur) return `€${(v.value * fx.usdToEur).toFixed(2)}`;
    }

    if (display === "USD") {
      if (v.currency === "USD") return `$${v.value.toFixed(2)}`;
      if (v.currency === "EUR" && fx.eurToUsd) return `$${(v.value * fx.eurToUsd).toFixed(2)}`;
    }

    const sym = v.currency === "EUR" ? "€" : "$";
    return `${sym}${v.value.toFixed(2)}`;
  };

  return (
    <section className="space-y-8">
      {debug && (
        <pre className="whitespace-pre-wrap rounded-md border border-yellow-500/30 bg-yellow-500/10 p-2 text-xs text-yellow-200">
          {JSON.stringify({ wanted, matchedId: card.id, matchPath: path, hero }, null, 2)}
        </pre>
      )}

      {/* Top: image left, info right */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: large card image */}
        <div className="lg:col-span-5">
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

        {/* Right: title + actions + meta */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-white">{card.name ?? card.id}</h1>
                <div className="mt-1 text-sm text-white/80">
                  {card.rarity ? <span className="mr-3">Rarity: {card.rarity}</span> : null}
                  {card.supertype ? <span className="mr-3">{card.supertype}</span> : null}
                  {chipsTypes.length ? <span className="mr-3">{chipsTypes.join(" • ")}</span> : null}
                  {chipsSubtypes.length ? <span>{chipsSubtypes.join(" • ")}</span> : null}
                </div>
              </div>

              {setHref ? (
                <Link href={setHref} className="text-sm text-sky-300 hover:underline">
                  View set →
                </Link>
              ) : null}
            </div>

            {/* Collection + Wishlist actions */}
            <div className="mt-3">
              <CardActions
                game="pokemon"
                cardId={card.id}
                cardName={card.name ?? undefined}
                setName={card.set_name ?? undefined}
                imageUrl={hero ?? undefined}
                canSave={canSave}
              />
            </div>

            {/* quick facts */}
            <div className="mt-3 text-sm text-white/70">
              {[
                card.series || undefined,
                card.ptcgo_code ? `PTCGO: ${card.ptcgo_code}` : undefined,
                card.release_date ? `Released: ${card.release_date}` : undefined,
              ]
                .filter(Boolean)
                .join(" • ")}
            </div>

            {/* Marketplaces */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <CardEbayCTA
                card={{
                  id: card.id,
                  name: card.name ?? card.id,
                  set_code: card.set_id ?? null,
                  set_name: card.set_name ?? null,
                }}
                game="Pokémon TCG"
                variant="pill"
              />

              <CardAmazonCTA url={amazonLink?.url} label={card.name ?? card.id} />
            </div>

            {/* legality chips */}
            {legalities.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {legalities.map((l, i) =>
                  l.format && l.legality ? (
                    <span
                      key={`${l.format}-${i}`}
                      className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] leading-5 text-white/80"
                    >
                      {l.format}: {l.legality}
                    </span>
                  ) : null,
                )}
              </div>
            ) : null}
          </div>

          {/* details grid */}
          <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
            <div className="grid grid-cols-2 gap-2 text-sm text-white/90">
              {card.hp ? (
                <div>
                  <span className="text-white/70">HP:</span> {card.hp}
                </div>
              ) : null}
              {card.level ? (
                <div>
                  <span className="text-white/70">Level:</span> {card.level}
                </div>
              ) : null}
              {fmtList(card.retreat_cost) ? (
                <div className="col-span-2">
                  <span className="text-white/70">Retreat Cost:</span> {fmtList(card.retreat_cost)}
                </div>
              ) : null}
              {card.converted_retreat_cost ? (
                <div className="col-span-2">
                  <span className="text-white/70">Converted Retreat:</span>{" "}
                  {card.converted_retreat_cost}
                </div>
              ) : null}
              {card.evolves_from ? (
                <div className="col-span-2">
                  <span className="text-white/70">Evolves from:</span> {card.evolves_from}
                </div>
              ) : null}
              {evoTo.length > 0 ? (
                <div className="col-span-2">
                  <span className="text-white/70">Evolves to:</span> {evoTo.join(", ")}
                </div>
              ) : null}
            </div>
          </div>

          {/* rules */}
          {rulesList.length > 0 ? (
            <section className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
              <h2 className="text-lg font-semibold text-white">Rules</h2>
              <ul className="mt-2 list-disc pl-5 text-sm text-white/85">
                {rulesList.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* ancient trait */}
          {card.ancient_trait_name || card.ancient_trait_text ? (
            <section className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
              <h2 className="text-lg font-semibold text-white">Ancient Trait</h2>
              {card.ancient_trait_name ? (
                <div className="font-medium text-white">{card.ancient_trait_name}</div>
              ) : null}
              {card.ancient_trait_text ? (
                <p className="mt-1 text-white/80">{card.ancient_trait_text}</p>
              ) : null}
            </section>
          ) : null}

          {/* flavor */}
          {card.flavor_text ? (
            <section className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
              <h2 className="text-lg font-semibold text-white">Flavor</h2>
              <p className="text-sm text-white/80">{card.flavor_text}</p>
            </section>
          ) : null}
        </div>
      </div>

      {/* --- Your holdings panel --- */}
      {userId ? (
        <section className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-white">Your holdings</h2>
            {holdingSummary?.firstAddedAt ? (
              <div className="text-xs text-white/60">
                Since {new Date(holdingSummary.firstAddedAt).toLocaleDateString()}
              </div>
            ) : null}
          </div>

          {holdingSummary ? (
            <div className="mt-3 grid gap-3 text-sm text-white/90 sm:grid-cols-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-white/60">Copies owned</div>
                <div className="mt-1 text-2xl font-semibold">{holdingSummary.quantity}</div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-wide text-white/60">Cost basis</div>
                <div className="mt-1 text-xl font-semibold">
                  {moneyFromUsdCents(holdingSummary.totalCostCents)}
                </div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-wide text-white/60">Est. current value</div>
                <div className="mt-1 text-xl font-semibold">
                  {moneyFromUsdCents(holdingSummary.totalValueCents)}
                </div>

                {profitCents != null ? (
                  <div
                    className={`mt-1 text-xs ${
                      profitCents >= 0 ? "text-emerald-300" : "text-red-300"
                    }`}
                  >
                    {profitCents >= 0 ? "▲" : "▼"} {moneyFromUsdCents(Math.abs(profitCents))}
                    {profitPct != null ? (
                      <span className="ml-1 text-white/60">
                        ({profitPct >= 0 ? "+" : ""}
                        {profitPct.toFixed(1)}%)
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-white/70">
              You haven&apos;t added this card to your collection yet. Use{" "}
              <span className="font-medium">Add to Collection</span> above to start tracking it.
            </p>
          )}
        </section>
      ) : null}

      {/* Market prices (unified tables) */}
      <MarketPrices category="pokemon" cardId={card.id} display={display} />
{/* eBay Snapshot */}
{ebay && (ebay.price_cents ?? null) != null ? (
  <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-lg font-semibold text-white">eBay Snapshot</h2>
      <div className="text-xs text-white/60">
        {"as_of_date" in ebay && ebay.as_of_date
          ? `As of ${String(ebay.as_of_date)}`
          : ""}
      </div>
    </div>

    <div className="text-white/90">
      <div>
        Price:{" "}
        <span className="font-semibold">
          {moneyFromUsdCents(ebay.price_cents)}
        </span>{" "}
        {"sample_size" in ebay && ebay.sample_size != null ? (
          <span className="text-white/60">• n={Number(ebay.sample_size)}</span>
        ) : null}
      </div>

      <div className="mt-1 text-xs text-white/60">
        Source: eBay (snapshot)
      </div>
    </div>
  </div>
) : null}

      {/* Other Marketplaces */}
      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Other Marketplaces</h2>
          <div className="text-xs text-white/60">Converted values are approximate</div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {(["ebay", "amazon", "coolstuffinc"] as const).map((key) => {
            const v = vendors[key];
            const label =
              key === "coolstuffinc"
                ? "CoolStuffInc"
                : key.charAt(0).toUpperCase() + key.slice(1);

            return (
              <div key={key} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-sm font-medium text-white">{label}</div>
                <div className="text-white/80">Price</div>
                <div className="mt-1 text-lg font-semibold text-white">
                  {showVendorPrice(v)}
                </div>

                {v?.url ? (
                  <a
                    href={v.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-sky-300 hover:underline"
                  >
                    View listing →
                  </a>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Mini trend glances */}
      {hasTcgHistory || hasCmkHistory ? (
        <section className="grid gap-3 md:grid-cols-2">
          {hasTcgHistory ? (
            <PriceSparkline
              category="pokemon"
              cardId={card.id}
              market="TCGplayer"
              keyName="normal"
              days={30}
              display={display}
              label="TCGplayer • Normal (30d)"
            />
          ) : null}

          {hasCmkHistory ? (
            <PriceSparkline
              category="pokemon"
              cardId={card.id}
              market="Cardmarket"
              keyName="trend_price"
              days={30}
              display={display}
              label="Cardmarket • Trend (30d)"
            />
          ) : null}
        </section>
      ) : (
        <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm text-white/70">
          No price history yet for this card.
        </div>
      )}

      {/* FX note if converting */}
      {display !== "NATIVE" && (fx.usdToEur != null || fx.eurToUsd != null) ? (
        <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
          <span>
            Converted to {display} using env FX (
            {[
              fx.usdToEur != null ? `USD→EUR=${fx.usdToEur.toFixed(4)}` : null,
              fx.eurToUsd != null ? `EUR→USD=${fx.eurToUsd.toFixed(4)}` : null,
            ]
              .filter(Boolean)
              .join(", ")}
            )
          </span>
        </div>
      ) : null}

      {/* Footer nav */}
      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/categories/pokemon/cards" className="text-sky-300 hover:underline">
          ← Back to cards
        </Link>

        {setHref ? (
          <>
            <Link href={setHref} className="text-sky-300 hover:underline">
              ← Back to set
            </Link>
            <Link href={`${setHref}/prices`} className="text-sky-300 hover:underline">
              View set price overview →
            </Link>
          </>
        ) : null}
      </div>
    </section>
  );
}
