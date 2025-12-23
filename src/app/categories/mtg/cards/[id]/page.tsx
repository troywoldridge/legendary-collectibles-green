// src/app/categories/magic/cards/[id]/page.tsx
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

/* Marketplace CTAs */
import CardAmazonCTA from "@/components/CardAmazonCTA";
import { getAffiliateLinkForCard } from "@/lib/affiliate";
import CardEbayCTA from "@/components/CardEbayCTA";

/* New combined actions (collection + wishlist) */
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
  set_name: string | null;
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

  if (/^\d+$/.test(up)) {
    return (
      <span className="mana mana--num" title={`Mana: ${up}`}>
        {up}
      </span>
    );
  }

  if (up === "X" || up === "Y" || up === "Z") {
    return (
      <span className="mana mana--var" title={`Mana: ${up}`}>
        {up}
      </span>
    );
  }

  if (up === "T") {
    return (
      <span className="mana mana--sym" title="Tap">
        ↷
      </span>
    );
  }

  if (up === "Q") {
    return (
      <span className="mana mana--sym" title="Untap">
        ↶
      </span>
    );
  }

  return (
    <span className={`mana mana--${up}`} title={`Mana: ${up}`}>
      {up}
    </span>
  );
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

/** SOI-1, SOI:1, SOI/1 → normalize to set + number */
function parseSetAndNumber(raw: string): { set: string; num: string } | null {
  const cleaned = raw
    .replace(/[–—]/g, "-")
    .replace(":", "-")
    .replace("/", "-");
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

/* ---------- Page ---------- */

export default async function MtgCardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const rawParam = decodeURIComponent(rawId ?? "").trim();

  const { userId } = await auth();
  const canSave = !!userId;

  if (!rawParam) {
    console.error("[MTG detail] notFound: empty param");
    notFound();
  }

  const idNoDashes = rawParam.replace(/-/g, "");

  // STEP 1: direct probe by id
  const probe = await db.execute<{ id: string }>(sql`
    SELECT c.id::text AS id
    FROM public.mtg_cards c
    WHERE c.id::text = ${rawParam}
      OR REPLACE(c.id::text,'-','') = ${idNoDashes}
    LIMIT 1
  `);
  let foundId = probe.rows?.[0]?.id ?? null;

  // STEP 1b: SET-NUM fallback (SOI-1 style)
  if (!foundId) {
    const parsed = parseSetAndNumber(rawParam);
    if (parsed) {
      const set = parsed.set.toLowerCase();
      const { exact, noZeros, lower } = normalizeNumVariants(parsed.num);
      const p2 = await db.execute<{ id: string }>(sql`
        SELECT c.id::text AS id
        FROM public.mtg_cards c
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

  if (!foundId) {
    try {
      const meta = await db.execute(sql`SELECT current_database() AS db, current_user AS usr`);
      console.error("[MTG detail] notFound: no foundId", {
        rawParam,
        db: (meta.rows?.[0] as any)?.db,
        usr: (meta.rows?.[0] as any)?.usr,
      });
    } catch {
      // ignore
    }
    notFound();
  }

  // STEP 2: load full card row
  // NOTE: ebay_* now comes from market tables (NOT ebay_price_snapshots)
  const rowRes = await db.execute<CardRow>(sql`
    SELECT
      c.id,
      c.name,
      c.printed_name,
      c.mana_cost,
      c.cmc::text AS cmc,
      c.colors::text AS colors,
      c.color_identity::text AS color_identity,
      c.type_line,
      c.rarity,
      c.set_code,
      c.set_name,
      c.collector_number,
      c.oracle_id::text AS oracle_id,
      c.layout,
      c.oracle_text,
      COALESCE(
        c.image_uris->>'normal',
        c.image_uris->>'large',
        c.image_uris->>'small',
        (c.card_faces_raw->0->'image_uris'->>'normal'),
        (c.card_faces_raw->0->'image_uris'->>'large'),
        (c.card_faces_raw->0->'image_uris'->>'small')
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
        WHERE mi.category = 'mtg'
          AND mi.card_id = c.id::text
          AND mpc.source = 'ebay'
        LIMIT 1
      ) AS ebay_usd_cents,

      (
        SELECT mei.external_url
        FROM public.market_items mi
        JOIN public.market_item_external_ids mei ON mei.market_item_id = mi.id
        WHERE mi.category = 'mtg'
          AND mi.card_id = c.id::text
          AND mei.marketplace = 'ebay'
        ORDER BY mei.updated_at DESC NULLS LAST, mei.created_at DESC NULLS LAST
        LIMIT 1
      ) AS ebay_url

    FROM public.mtg_cards c
    LEFT JOIN public.mtg_prices_effective e ON e.scryfall_id = c.id
    LEFT JOIN public.mtg_card_prices     s ON s.scryfall_id  = c.id
    WHERE c.id::text = ${foundId}
    LIMIT 1
  `);

  const card = rowRes.rows?.[0] ?? null;

  if (!card) {
    try {
      const meta = await db.execute(sql`SELECT current_database() AS db, current_user AS usr`);
      console.error("[MTG detail] notFound: no card row", {
        rawParam,
        foundId,
        db: (meta.rows?.[0] as any)?.db,
        usr: (meta.rows?.[0] as any)?.usr,
      });
    } catch {
      // ignore
    }
    notFound();
  }

  // Optional set info
  const setRow =
    card.set_code
      ? (
          await db.execute<SetRow>(sql`
            SELECT
              name,
              set_type,
              block,
              COALESCE(TO_CHAR(released_at,'YYYY-MM-DD'), NULL) AS released_at
            FROM public.mtg_sets
            WHERE LOWER(code) = LOWER(${card.set_code})
            LIMIT 1
          `)
        ).rows?.[0] ?? null
      : null;

  // Fire-and-forget latest eBay snapshot (now reads market_* tables)
  try {
    await getLatestEbaySnapshot({
      category: "mtg",
      cardId: card.id,
      segment: "all",
    });
  } catch (err) {
    console.error("[ebay snapshot failed]", err);
  }

  const hero = (card.image_url ?? "").replace(/^http:\/\//, "https://") || null;

  const setHref = card.set_code
    ? `/categories/magic/sets/${encodeURIComponent(card.set_code)}`
    : null;

  const price = {
    usd: card.usd,
    usd_foil: card.usd_foil,
    usd_etched: card.usd_etched,
    eur: card.eur,
    tix: card.tix,
    updated_at: card.price_updated,
  };

  const hasPrimaryPrice =
    !!price.usd ||
    !!price.usd_foil ||
    !!price.usd_etched ||
    !!price.eur ||
    !!price.tix;

  // market table values
  const serverEbayPrice =
    typeof card.ebay_usd_cents === "number" ? card.ebay_usd_cents / 100 : null;
  const serverEbayUrl = card.ebay_url || null;

  const ebayQ = [
    card.name ?? "",
    card.set_code || setRow?.name || "",
    card.collector_number || "",
    "MTG",
  ]
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
        {/* Left: card image */}
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
                <div className="absolute inset-0 grid place-items-center text-white/70">
                  No image
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: meta + actions + CTAs */}
        <div className="md:col-span-7 space-y-4">
          <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-white/80">
                {setHref ? (
                  <>
                    Set:{" "}
                    <Link href={setHref} className="text-sky-300 hover:underline">
                      {setRow?.name ?? card.set_name ?? card.set_code}
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
                setName={setRow?.name ?? card.set_name ?? undefined}
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
                  set_name: setRow?.name ?? card.set_name ?? undefined,
                }}
                game="Magic: The Gathering"
              />

              <CardAmazonCTA url={amazonLink?.url} label={card.name} />
            </div>
          </div>

          {/* Prices card */}
          {hasPrimaryPrice && (
            <section className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Market Prices</h2>
                <div className="text-xs text-white/60">Updated {price.updated_at ?? "—"}</div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                <div>
                  <div className="text-sm text-white/70">USD</div>
                  <div className="text-lg font-semibold text-white">{price.usd ?? "—"}</div>
                </div>
                <div>
                  <div className="text-sm text-white/70">USD Foil</div>
                  <div className="text-lg font-semibold text-white">{price.usd_foil ?? "—"}</div>
                </div>
                <div>
                  <div className="text-sm text-white/70">USD Etched</div>
                  <div className="text-lg font-semibold text-white">{price.usd_etched ?? "—"}</div>
                </div>
                <div>
                  <div className="text-sm text-white/70">EUR</div>
                  <div className="text-lg font-semibold text-white">{price.eur ?? "—"}</div>
                </div>
                <div>
                  <div className="text-sm text-white/70">TIX</div>
                  <div className="text-lg font-semibold text-white">{price.tix ?? "—"}</div>
                </div>
              </div>
            </section>
          )}

          {/* eBay snapshot fallback if no primary price */}
          {!hasPrimaryPrice && serverEbayPrice != null && (
            <section className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
              <div className="mb-2 flex items-center justify_between">
                <h2 className="text-lg font-semibold text-white">Market Prices (eBay)</h2>
                <div className="text-xs text-white/60">Latest market snapshot</div>
              </div>

              <div className="text-lg font-semibold text-white">
                ${serverEbayPrice.toFixed(2)}
                {serverEbayUrl ? (
                  <Link href={serverEbayUrl} className="ml-2 text-sky-300 underline" target="_blank">
                    View on eBay
                  </Link>
                ) : null}
              </div>
            </section>
          )}

          {/* Client-side eBay fallback (only when missing primary price) */}
          <EbayFallbackPrice
            cardId={card.id}
            q={ebayQ}
            showWhen="missing"
            hasPrimaryPrice={hasPrimaryPrice}
          />

          {/* Rules text */}
          {card.oracle_text && (
            <section className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
              <h2 className="text-lg font-semibold text-white">Rules Text</h2>
              <div className="mt-2 text-sm text-white/85">{nl2p(card.oracle_text)}</div>
            </section>
          )}
        </div>
      </div>
    </section>
  );
}
