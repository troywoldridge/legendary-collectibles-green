/* eslint-disable @typescript-eslint/no-unused-vars */
import "server-only";

import type { Metadata } from "next";
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
  tcgplayer: string | null;
  cardmarket: string | null;
  ebay: string | null;
  amazon: string | null;
  coolstuffinc: string | null;
};
type BanlistRow = { tcg: string | null; ocg: string | null; goat: string | null };

type SetEntry = {
  set_name: string;
  set_code: string | null;
  set_rarity: string | null;
  set_price: string | null;
};

/* ---------------- Helpers ---------------- */
function money(v: string | number | null | undefined) {
  if (!v) return "—";
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (!Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function bestImage(imgs: ImageRow[]): string | null {
  if (!imgs?.length) return null;
  const first = imgs[0];
  return first.large || first.small || null;
}

function absUrl(path: string) {
  const base = (site?.url ?? "https://legendary-collectibles.com").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
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
        FROM ygo_card_prices p
        WHERE p.card_id = ${id}
        LIMIT 1
      `)
    ).rows?.[0] ?? null;

  const banlist =
    (
      await db.execute<BanlistRow>(sql`
        SELECT b.ban_tcg AS tcg, b.ban_ocg AS ocg, b.ban_goat AS goat
        FROM ygo_card_banlist b
        WHERE b.card_id = ${id}
        LIMIT 1
      `)
    ).rows?.[0] ?? null;

  const sets =
    (
      await db.execute<SetEntry>(sql`
        SELECT s.set_name, s.set_code, s.set_rarity, s.set_price
        FROM ygo_card_sets s
        WHERE s.card_id = ${id}
        GROUP BY s.set_name, s.set_code, s.set_rarity, s.set_price
        ORDER BY s.set_name ASC, s.set_code ASC NULLS LAST
      `)
    ).rows ?? [];

  return { card, images, prices, banlist, sets };
}

/* ---------------- SEO: Dynamic Metadata ---------------- */
export async function generateMetadata(
  { params }: { params: { id: string } }
): Promise<Metadata> {
  const id = decodeURIComponent(params.id ?? "").trim();
  if (!id) {
    const canonical = absUrl("/categories/yugioh/cards");
    return {
      title: `Yu-Gi-Oh! Cards | ${site.name}`,
      description: "Browse Yu-Gi-Oh! cards, track prices, and manage your collection.",
      alternates: { canonical },
    };
  }

  // Load minimal card + image for SEO
  const card =
    (
      await db.execute<{ id: string; name: string; type: string | null; race: string | null; attribute: string | null; archetype: string | null }>(sql`
        SELECT
          c.card_id AS id,
          c.name,
          c.type,
          c.race,
          c.attribute,
          c.archetype
        FROM ygo_cards c
        WHERE c.card_id = ${id}
        LIMIT 1
      `)
    ).rows?.[0] ?? null;

  const img =
    (
      await db.execute<{ large: string | null; small: string | null }>(sql`
        SELECT i.image_url AS large, i.image_url_small AS small
        FROM ygo_card_images i
        WHERE i.card_id = ${id}
        ORDER BY (CASE WHEN i.image_url IS NOT NULL THEN 0 ELSE 1 END),
                 i.image_url_small NULLS LAST
        LIMIT 1
      `)
    ).rows?.[0] ?? null;

  const canonical = absUrl(`/categories/yugioh/cards/${encodeURIComponent(id)}`);

  // If not found, return a safe non-indexable result (prevents “soft 404” garbage titles)
  if (!card) {
    return {
      title: `Yu-Gi-Oh! Card Not Found | ${site.name}`,
      description: "We couldn’t find that Yu-Gi-Oh! card. Try searching by name or card ID.",
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
  }

  const ogImage = (img?.large || img?.small || site.ogImage || "/og-image.png") ?? "/og-image.png";
  const title = `${card.name} — Yu-Gi-Oh! Prices & Collection | ${site.name}`;

  const descBits = [
    card.type ? `Type: ${card.type}` : null,
    card.attribute ? `Attribute: ${card.attribute}` : null,
    card.race ? `Race: ${card.race}` : null,
    card.archetype ? `Archetype: ${card.archetype}` : null,
    "Track prices, add to collection, and shop listings.",
  ].filter(Boolean);

  const description = descBits.join(" • ");

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      title,
      description,
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

  const cover = bestImage(images);
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

  return (
    <section className="space-y-8">
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
                <div className="absolute inset-0 grid place-items-center text-white/70">
                  No image
                </div>
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
              </div>
            </div>

            {/* CTAs */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <CardEbayCTA
                card={{ id: card.id, name: card.name, set_name: firstSet ?? null }}
                game="Yu-Gi-Oh!"
                variant="pill"
              />
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
              <div className="text-xs text-white/60">Native currency as provided</div>
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
        <Link href="/categories/yugioh/cards" className="text-sky-300 hover:underline">
          ← Back to cards
        </Link>
        {firstSet && (
          <Link
            href={`/categories/yugioh/sets/${encodeURIComponent(firstSet)}`}
            className="text-sky-300 hover:underline"
          >
            ← Back to set
          </Link>
        )}
      </div>
    </section>
  );
}

function PriceBox({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="text-sm font-medium text-white">{label}</div>
      <div className="text-white/80">Price</div>
      <div className="mt-1 text-lg font-semibold text-white">{money(value ?? null)}</div>
    </div>
  );
}
