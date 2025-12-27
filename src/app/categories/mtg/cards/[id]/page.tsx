/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";

import { getLatestEbaySnapshot } from "@/lib/ebay";
import EbayFallbackPrice from "@/components/EbayFallbackPrice";

import CardAmazonCTA from "@/components/CardAmazonCTA";
import { getAffiliateLinkForCard } from "@/lib/affiliate";
import CardEbayCTA from "@/components/CardEbayCTA";
import CardActions from "@/components/collection/CardActions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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
      <span
        className="mana mana--hybrid"
        style={{ ["--c1" as any]: c1, ["--c2" as any]: c2 }}
        title={`Mana: ${up}`}
      >
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

/* ---------- ID parsing helpers ---------- */
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

function money(s?: string | null) {
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  return n.toFixed(2);
}

/* ---------- Page ---------- */
export default async function MtgCardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const rawParam = decodeURIComponent(rawId ?? "").trim();
  if (!rawParam) notFound();

  const { userId } = await auth();
  const canSave = !!userId;

  const idNoDashes = rawParam.replace(/-/g, "");

  // STEP 1: direct probe by uuid text
  const probe = await db.execute<{ id: string }>(sql`
    SELECT c.id::text AS id
    FROM public.scryfall_cards_raw c
    WHERE c.id::text = ${rawParam}
      OR REPLACE(c.id::text,'-','') = ${idNoDashes}
    LIMIT 1
  `);
  let foundId = probe.rows?.[0]?.id ?? null;

  // STEP 1b: SET-NUM fallback (SOI-1)
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

  if (!foundId) notFound();

  // STEP 2: load card row (FACE-SAFE fields + correct market tables)
  const rowRes = await db.execute<CardRow>(sql`
    SELECT
      c.id::text AS id,
      c.name,

      (c.payload->>'printed_name') AS printed_name,

      -- Face-safe mana / rules text (many cards store these in card_faces[])
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

      -- Face-safe image URL
      COALESCE(
        (c.payload->'image_uris'->>'normal'),
        (c.payload->'image_uris'->>'large'),
        (c.payload->'image_uris'->>'small'),
        (c.payload->'card_faces'->0->'image_uris'->>'normal'),
        (c.payload->'card_faces'->0->'image_uris'->>'large'),
        (c.payload->'card_faces'->0->'image_uris'->>'small')
      ) AS image_url,

      -- Prices: effective first, then scryfall_latest fallback
      COALESCE(e.effective_usd,        s.usd)::text        AS usd,
      COALESCE(e.effective_usd_foil,   s.usd_foil)::text   AS usd_foil,
      COALESCE(e.effective_usd_etched, s.usd_etched)::text AS usd_etched,
      COALESCE(e.effective_eur,        s.eur)::text        AS eur,
      COALESCE(e.effective_tix,        s.tix)::text        AS tix,
      COALESCE(
        TO_CHAR(e.effective_updated_at,'YYYY-MM-DD'),
        TO_CHAR(s.updated_at,'YYYY-MM-DD')
      ) AS price_updated,

      -- eBay price snapshot from your market tables (schema-correct)
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

  // kick off ebay snapshot updater (non-fatal)
  try {
    await getLatestEbaySnapshot({ category: "mtg", cardId: card.id, segment: "all" });
  } catch (err) {
    console.error("[ebay snapshot failed]", err);
  }

  const hero = (card.image_url ?? "").replace(/^http:\/\//, "https://") || null;
  const setHref = card.set_code ? `/categories/mtg/sets/${encodeURIComponent(card.set_code)}` : null;

  const price = {
    usd: money(card.usd),
    usd_foil: money(card.usd_foil),
    usd_etched: money(card.usd_etched),
    eur: money(card.eur),
    tix: card.tix,
    updated_at: card.price_updated,
  };

  const hasPrimaryPrice = !!price.usd || !!price.usd_foil || !!price.usd_etched || !!price.eur || !!price.tix;

  const serverEbayPrice = typeof card.ebay_usd_cents === "number" ? card.ebay_usd_cents / 100 : null;
  const serverEbayUrl = card.ebay_url || null;

  const ebayQ = [card.name ?? "", card.set_code || setRow?.name || "", card.collector_number || "", "MTG"]
    .filter(Boolean)
    .join(" ");

  const amazonLink = await getAffiliateLinkForCard({
    category: "mtg",
    cardId: card.id,
    marketplace: "amazon",
  });

  return (
    <section className="space-y-8">
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
                    <Link href={setHref} className="text-sky-300 hover:underline">
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

            <div className="mt-4">
              <CardActions
                game="mtg"
                cardId={card.id}
                cardName={card.name ?? undefined}
                setName={setRow?.name ?? undefined}
                imageUrl={hero ?? undefined}
                canSave={canSave}
              />
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
              <CardAmazonCTA url={amazonLink?.url} label={card.name} />
            </div>
          </div>

          {/* Market Prices: always render so the page never looks empty */}
          <section className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                Market Prices{!hasPrimaryPrice && serverEbayPrice != null ? " (Scryfall missing — eBay available)" : ""}
              </h2>
              <div className="text-xs text-white/60">Updated {price.updated_at ?? "—"}</div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              <div><div className="text-sm text-white/70">USD</div><div className="text-lg font-semibold text-white">{price.usd ?? "—"}</div></div>
              <div><div className="text-sm text-white/70">USD Foil</div><div className="text-lg font-semibold text-white">{price.usd_foil ?? "—"}</div></div>
              <div><div className="text-sm text-white/70">USD Etched</div><div className="text-lg font-semibold text-white">{price.usd_etched ?? "—"}</div></div>
              <div><div className="text-sm text-white/70">EUR</div><div className="text-lg font-semibold text-white">{price.eur ?? "—"}</div></div>
              <div><div className="text-sm text-white/70">TIX</div><div className="text-lg font-semibold text-white">{price.tix ?? "—"}</div></div>
            </div>

            {!hasPrimaryPrice && serverEbayPrice != null ? (
              <div className="mt-3 text-sm text-white/80">
                eBay snapshot: <span className="font-semibold text-white">${serverEbayPrice.toFixed(2)}</span>
                {serverEbayUrl ? (
                  <Link href={serverEbayUrl} className="ml-2 text-sky-300 underline" target="_blank">
                    View on eBay
                  </Link>
                ) : null}
              </div>
            ) : null}
          </section>

          <EbayFallbackPrice cardId={card.id} q={ebayQ} showWhen="missing" hasPrimaryPrice={hasPrimaryPrice} />

          {/* Always show a details block */}
          <section className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
            <h2 className="text-lg font-semibold text-white">Card Details</h2>
            <div className="mt-2 grid gap-2 text-sm text-white/85 sm:grid-cols-2">
              <div><span className="text-white/60">Layout:</span> {card.layout ?? "—"}</div>
              <div><span className="text-white/60">Oracle ID:</span> {card.oracle_id ?? "—"}</div>
              <div><span className="text-white/60">Set Code:</span> {card.set_code ?? "—"}</div>
              <div><span className="text-white/60">Collector #:</span> {card.collector_number ?? "—"}</div>
            </div>
          </section>

          {/* Rules text (face-safe now, so it will appear for most cards) */}
          {card.oracle_text ? (
            <section className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
              <h2 className="text-lg font-semibold text-white">Rules Text</h2>
              <div className="mt-2 text-sm text-white/85">{nl2p(card.oracle_text)}</div>
            </section>
          ) : (
            <section className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
              <h2 className="text-lg font-semibold text-white">Rules Text</h2>
              <div className="mt-2 text-sm text-white/60">
                No rules text available for this item (common for art cards, tokens, or special prints).
              </div>
            </section>
          )}
        </div>
      </div>
    </section>
  );
}
