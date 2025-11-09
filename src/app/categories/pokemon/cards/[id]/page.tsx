import "server-only";
import Link from "next/link";
import Image from "next/image";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import MarketPrices from "@/components/MarketPrices";
import PriceSparkline from "@/components/PriceSparkline";
import { type DisplayCurrency, getFx } from "@/lib/pricing";
import { getVendorPricesForCard } from "@/lib/vendorPrices";
import { getLatestEbaySnapshot } from "@/lib/ebay";

/* ★ Plan gate + Add to Collection */
import { auth } from "@clerk/nextjs/server";
import { getUserPlan } from "@/lib/plans";
import AddToCollectionButton from "@/components/AddToCollectionButton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ---------------- Types ---------------- */
type CardRow = {
  id: string;
  name: string | null;
  supertype: string | null;
  subtypes: string | null;                 // text that may contain JSON/CSV
  level: string | null;
  hp: string | null;
  types: string | null;                    // text that may contain JSON/CSV
  evolves_from: string | null;
  evolves_to: string | null;               // text that may contain JSON/CSV
  rules: string | null;                    // text that may contain JSON/CSV
  ancient_trait_name: string | null;
  ancient_trait_text: string | null;
  converted_retreat_cost: string | null;
  retreat_cost: string | null;             // text that may contain JSON/CSV
  set_id: string | null;                   // maps to tcg_cards."set.id"
  set_name: string | null;                 // maps to tcg_cards."set.name"
  series: string | null;                   // maps to tcg_cards."set.series"
  printed_total: string | null;            // maps to tcg_cards."set.printedTotal"
  total: string | null;                    // maps to tcg_cards."set.total"
  ptcgo_code: string | null;               // maps to tcg_cards."set.ptcgoCode"
  release_date: string | null;             // maps to tcg_cards."set.releaseDate"
  artist: string | null;
  rarity: string | null;
  flavor_text: string | null;
  small_image: string | null;              // tcg_cards.image_small
  large_image: string | null;              // tcg_cards.image_large
  tcgplayer_url: string | null;
  tcgplayer_updated_at: string | null;
  cardmarket_url: string | null;
  cardmarket_updated_at: string | null;
};

type LegalityRow = { format: string | null; legality: string | null };
type SearchParams = Record<string, string | string[] | undefined>;
type VendorKey = "ebay" | "amazon" | "coolstuffinc";
type VendorPrice = { value: number | null; currency: string; url: string | null };

/** ---------------- Helpers ---------------- */
function bestImg(c: CardRow) {
  return c.large_image || c.small_image || null;
}

/** Interpret comma/pipe/semicolon lists or JSON arrays stored as text */
function splitList(s?: string | null): string[] {
  if (!s) return [];
  const t = s.trim();
  if (!t) return [];
  if ((t.startsWith("[") && t.endsWith("]")) || (t.startsWith("{") && t.endsWith("}"))) {
    try {
      const parsed = JSON.parse(t);
      if (Array.isArray(parsed)) return parsed.map(String);
      if (parsed && typeof parsed === "object") return Object.values(parsed).map(String);
    } catch {}
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

/** Accept both ?display= and legacy ?currency= (USD|EUR) else NATIVE */
function readDisplay(sp: SearchParams): DisplayCurrency {
  const a = (Array.isArray(sp?.display) ? sp.display[0] : sp?.display)?.toUpperCase();
  const b = (Array.isArray(sp?.currency) ? sp.currency[0] : sp?.currency)?.toUpperCase();
  const v = a || b;
  return v === "USD" || v === "EUR" ? (v as DisplayCurrency) : "NATIVE";
}

function withParam(baseHref: string, key: string, val: string) {
  const u = new URL(baseHref, "https://x/"); // dummy origin
  u.searchParams.set(key, val);
  return u.pathname + (u.search ? u.search : "");
}

/** ---------------- Data loaders ---------------- */
async function loadCardById(wanted: string): Promise<CardRow | null> {
  // Exact ID lookup using explicit column mapping (quotes for dotted columns)
  const exact = await db.execute<CardRow>(sql`
    SELECT
      c.id,
      c.name,
      c.supertype,
      c.subtypes::text           AS subtypes,
      c.level::text              AS level,
      c.hp::text                 AS hp,
      c.types::text              AS types,
      c.evolves_from,
      c.evolves_to::text         AS evolves_to,
      c.rules::text              AS rules,
      c.ancient_trait_name,
      c.ancient_trait_text,
      c.converted_retreat_cost::text AS converted_retreat_cost,
      c.retreat_cost::text       AS retreat_cost,
      c."set.id"                 AS set_id,
      c."set.name"               AS set_name,
      c."set.series"             AS series,
      c."set.printedTotal"::text AS printed_total,
      c."set.total"::text        AS total,
      c."set.ptcgoCode"          AS ptcgo_code,
      c."set.releaseDate"        AS release_date,
      c.artist,
      c.rarity,
      c.flavor_text,
      c.image_small              AS small_image,
      c.image_large              AS large_image,
      c.tcgplayer_url,
      c.tcgplayer_updated_at::text AS tcgplayer_updated_at,
      c.cardmarket_url,
      c.cardmarket_updated_at::text AS cardmarket_updated_at
    FROM public.tcg_cards c
    WHERE c.id = ${wanted}
    LIMIT 1
  `);
  if (exact.rows?.[0]) return exact.rows[0];

  // Case/whitespace-insensitive fallback
  const fallback = await db.execute<CardRow>(sql`
    SELECT
  c.id,
  c.name,
  c.supertype,
  c.subtypes::text           AS subtypes,
  c.level::text              AS level,
  c.hp::text                 AS hp,
  c.types::text              AS types,
  c.evolves_from,
  c.evolves_to::text         AS evolves_to,
  c.rules::text              AS rules,
  c.ancient_trait_name,
  c.ancient_trait_text,
  c.converted_retreat_cost::text AS converted_retreat_cost,
  c.retreat_cost::text       AS retreat_cost,
  c.set_id                   AS set_id,
  c.set_name                 AS set_name,
  c.set_series               AS series,
  c.set_printedTotal::text   AS printed_total,
  c.set_total::text          AS total,
  c.set_ptcgoCode            AS ptcgo_code,
  c.set_releaseDate          AS release_date,
  c.artist,
  c.rarity,
  c.flavor_text,
  c.image_small              AS small_image,
  c.image_large              AS large_image,
  c.tcgplayer_url,
  c.tcgplayer_updated_at::text AS tcgplayer_updated_at,
  c.cardmarket_url,
  c.cardmarket_updated_at::text AS cardmarket_updated_at
FROM public.tcg_cards c
WHERE c.id = $1
LIMIT 1

  `);
  return fallback.rows?.[0] ?? null;
}

/** ---------------- Page ---------------- */
export default async function PokemonCardDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const baseHref = `/categories/pokemon/cards/${encodeURIComponent(id ?? "")}`;
  const display = readDisplay(sp);
  const wanted = decodeURIComponent(id ?? "").trim();

  const card = await loadCardById(wanted);

  /* ---------- Not found ---------- */
  if (!card) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold text-white">Card not found</h1>
        <p className="text-white/70 text-sm break-all">
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

  // eBay snapshot (USD-based cents)
  const ebay = await getLatestEbaySnapshot("pokemon", card.id, "all");

  // set legalities (chips)
  const legalities: LegalityRow[] =
    card.set_id
      ? (
          await db.execute<LegalityRow>(
            sql`SELECT format, legality FROM tcg_sets_legalities WHERE set_id = ${card.set_id} ORDER BY format ASC`
          )
        ).rows ?? []
      : [];

  const hero = bestImg(card);

  // Prefer set_id (your set pages key on this)
  const setHref = card.set_id
    ? `/categories/pokemon/sets/${encodeURIComponent(card.set_id)}`
    : card.set_name
    ? `/categories/pokemon/sets/${encodeURIComponent(card.set_name)}`
    : null;

  const chipsTypes = splitList(card.types);
  const chipsSubtypes = splitList(card.subtypes);
  const rulesList = splitList(card.rules);
  const evoTo = splitList(card.evolves_to);

  const fx = getFx();

  // Load “Other Marketplaces” snapshot values
  const rawVendors = await getVendorPricesForCard("pokemon", card.id, [
    "ebay",
    "amazon",
    "coolstuffinc",
  ]);
  const vendors = rawVendors as Record<VendorKey, VendorPrice>;

  // helper to display USD/EUR for eBay cents
  const moneyFromUsdCents = (cents?: number | null) => {
    if (cents == null) return "—";
    if (display === "EUR" && fx.usdToEur) {
      const eur = (cents / 100) * fx.usdToEur;
      return `€${eur.toFixed(2)}`;
    }
    return `$${(cents / 100).toFixed(2)}`;
  };

  /* ★ Plan gate — Free users can’t save */
  const { userId } = await auth();

  let canSave = false;
  if (userId) {
    const { limits } = await getUserPlan(userId);
    canSave = (limits.maxItems ?? 0) > 0;
  }

  return (
    <article className="grid gap-6 md:grid-cols-2">
      {/* image */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-2 overflow-hidden">
        <div className="relative w-full" style={{ aspectRatio: "3 / 4" }}>
          {hero ? (
            <Image
              src={hero}
              alt={card.name ?? card.id}
              fill
              unoptimized
              className="object-contain"
              sizes="(max-width: 768px) 100vw, 50vw"
              priority
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-white/70">
              No image
            </div>
          )}
        </div>
      </div>

      {/* details */}
      <div className="grid gap-4">
        {/* top line: set + display toggle */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-white/80">
            {setHref ? (
              <>
                Set:{" "}
                <Link href={setHref} className="text-sky-300 hover:underline">
                  {card.set_name ?? card.set_id}
                </Link>
              </>
            ) : null}
          </div>

          {/* display selector */}
          <div className="rounded-md border border-white/20 bg-white/10 p-1 text-sm text-white">
            <span className="px-2">Display:</span>
            <Link
              href={withParam(baseHref, "display", "NATIVE")}
              className={`rounded px-2 py-1 ${
                display === "NATIVE" ? "bg-white/20" : "hover:bg-white/10"
              }`}
            >
              Native
            </Link>
            <Link
              href={withParam(baseHref, "display", "USD")}
              className={`ml-1 rounded px-2 py-1 ${
                display === "USD" ? "bg-white/20" : "hover:bg-white/10"
              }`}
            >
              USD
            </Link>
            <Link
              href={withParam(baseHref, "display", "EUR")}
              className={`ml-1 rounded px-2 py-1 ${
                display === "EUR" ? "bg-white/20" : "hover:bg-white/10"
              }`}
            >
              EUR
            </Link>
          </div>
        </div>

        {/* headline */}
        <h1 className="text-2xl font-bold text-white">{card.name ?? card.id}</h1>

        {/* ★ Add to collection / Upgrade CTA */}
        <div className="mt-1">
          {canSave ? (
            <AddToCollectionButton
              game="pokemon"
              cardId={card.id}
              cardName={card.name || undefined}
              setName={card.set_name || undefined}
              number={undefined}
              imageUrl={hero || undefined}
            />
          ) : (
            <Link
              href="/pricing"
              className="inline-block px-3 py-2 rounded bg-amber-500 text-white hover:bg-amber-600"
            >
              Upgrade to track your collection
            </Link>
          )}
        </div>

        {/* quick facts line */}
        <div className="text-sm text-white/70">
          {[
            card.series || undefined,
            card.ptcgo_code ? `PTCGO: ${card.ptcgo_code}` : undefined,
            card.release_date ? `Released: ${card.release_date}` : undefined,
          ]
            .filter(Boolean)
            .join(" • ")}
        </div>

        {/* legality chips */}
        {legalities.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {legalities.map((l, i) =>
              l.format && l.legality ? (
                <span
                  key={i}
                  className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] leading-5 text-white/80"
                >
                  {l.format}: {l.legality}
                </span>
              ) : null
            )}
          </div>
        )}

        {/* quick facts grid */}
        <div className="grid grid-cols-2 gap-2 text-sm text-white/90">
          {card.rarity && (
            <div>
              <span className="text-white/70">Rarity:</span> {card.rarity}
            </div>
          )}
          {card.artist && (
            <div>
              <span className="text-white/70">Artist:</span> {card.artist}
            </div>
          )}
          {card.hp && (
            <div>
              <span className="text-white/70">HP:</span> {card.hp}
            </div>
          )}
          {card.level && (
            <div>
              <span className="text-white/70">Level:</span> {card.level}
            </div>
          )}
          {fmtList(card.retreat_cost) && (
            <div className="col-span-2">
              <span className="text-white/70">Retreat Cost:</span> {fmtList(card.retreat_cost)}
            </div>
          )}
          {card.converted_retreat_cost && (
            <div className="col-span-2">
              <span className="text-white/70">Converted Retreat:</span>{" "}
              {card.converted_retreat_cost}
            </div>
          )}
          {card.evolves_from && (
            <div className="col-span-2">
              <span className="text-white/70">Evolves from:</span> {card.evolves_from}
            </div>
          )}
          {evoTo.length > 0 && (
            <div className="col-span-2">
              <span className="text-white/70">Evolves to:</span> {evoTo.join(", ")}
            </div>
          )}
        </div>

        {/* chips */}
        {(chipsTypes.length > 0 || chipsSubtypes.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {chipsTypes.map((t, i) => (
              <span
                key={`t-${i}`}
                className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-xs text-white"
              >
                {t}
              </span>
            ))}
            {chipsSubtypes.map((t, i) => (
              <span
                key={`st-${i}`}
                className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-xs text-white/90"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {/* rules / ancient trait / flavor */}
        {rulesList.length > 0 && (
          <section className="rounded-lg border border-white/10 bg-white/5 p-3">
            <h2 className="font-semibold text-white">Rules</h2>
            <ul className="mt-1 list-disc pl-5 text-sm text-white/85">
              {rulesList.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </section>
        )}

        {(card.ancient_trait_name || card.ancient_trait_text) && (
          <section className="rounded-lg border border-white/10 bg-white/5 p-3">
            <h2 className="font-semibold text-white">Ancient Trait</h2>
            <div className="text-sm text-white/90">
              {card.ancient_trait_name ? (
                <div className="font-medium">{card.ancient_trait_name}</div>
              ) : null}
              {card.ancient_trait_text ? (
                <p className="text-white/80 mt-1">{card.ancient_trait_text}</p>
              ) : null}
            </div>
          </section>
        )}

        {card.flavor_text && (
          <section className="rounded-lg border border-white/10 bg-white/5 p-3">
            <h2 className="font-semibold text-white">Flavor</h2>
            <p className="text-sm text-white/80">{card.flavor_text}</p>
          </section>
        )}

        {/* unified price panel (your component) */}
        <MarketPrices category="pokemon" cardId={card.id} display={display} />

        {/* eBay Snapshot (latest) */}
        {ebay && ebay.median_cents != null && (
          <section className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">eBay Snapshot</h2>
              <div className="text-xs text-white/60">
                {ebay.created_at ? new Date(ebay.created_at).toLocaleDateString() : ""}
              </div>
            </div>
            <div className="text-white/90">
              <div>
                Median:{" "}
                <span className="font-semibold">{moneyFromUsdCents(ebay.median_cents)}</span>{" "}
                {ebay.sample_count ? (
                  <span className="text-white/60">• n={ebay.sample_count}</span>
                ) : null}
              </div>
              <div className="text-sm text-white/80">
                IQR: {moneyFromUsdCents(ebay.p25_cents)} – {moneyFromUsdCents(ebay.p75_cents)}
              </div>
              <div className="text-xs text-white/60 mt-1">
                Source: eBay Browse API (US, USD; outliers pruned)
              </div>
            </div>
          </section>
        )}

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
              const sym = v.currency === "EUR" ? "€" : "$";
              const price = v.value != null ? `${sym}${Number(v.value).toFixed(2)}` : "—";
              return (
                <div key={key} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-sm font-medium text-white">{label}</div>
                  <div className="text-white/80">Price</div>
                  <div className="mt-1 text-lg font-semibold text-white">{price}</div>
                  {v.url ? (
                    <a
                      href={v.url}
                      target="_blank"
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

        {/* mini trend glances (sparklines) */}
        <section className="grid gap-3 md:grid-cols-2">
          <PriceSparkline
            category="pokemon"
            cardId={card.id}
            market="TCGplayer"
            keyName="normal"
            days={30}
            display={display}
            label="TCGplayer • Normal (30d)"
          />
          <PriceSparkline
            category="pokemon"
            cardId={card.id}
            market="Cardmarket"
            keyName="trend_price"
            days={30}
            display={display}
            label="Cardmarket • Trend (30d)"
          />
        </section>

        {/* FX note if converting */}
        {display !== "NATIVE" && (fx.usdToEur != null || fx.eurToUsd != null) && (
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
        )}

        {/* back links */}
        <div className="mt-2 flex gap-4">
          <Link href="/categories/pokemon/cards" className="text-sky-300 hover:underline">
            ← Back to cards
          </Link>
          {setHref && (
            <>
              <Link href={setHref} className="text-sky-300 hover:underline">
                ← Back to set
              </Link>
              <Link href={`${setHref}/prices`} className="text-sky-300 hover:underline">
                View set price overview →
              </Link>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
