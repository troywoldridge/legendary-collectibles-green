import "server-only";
import Link from "next/link";
import Image from "next/image";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getLatestEbaySnapshot } from "@/lib/ebay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ---- DB row types ---- */
type CardRow = {
  id: string;
  player: string | null;
  team: string | null;
  sport: string | null;
  year: number | null;
  set_name: string | null;
  number: string | null;
  source: string | null;
  source_url: string | null;
  canonical_key: string | null;
  // resolved via lateral joins:
  set_id: string | null;
  cf_image_id: string | null;
  src_url: string | null;
};

type PricePick = {
  scp_id: string;
  console_name: string | null;
  product_name: string | null;
  release_date: string | null; // DATE -> string via driver
  sales_volume: number | null;
  last_seen: string | null;
  loose_price: number | null;
  graded_price: number | null;
  new_price: number | null;
  cib_price: number | null;
};

type SearchParams = Record<string, string | string[] | undefined>;

/* ---------------- helpers ---------------- */
const CF_ACCOUNT_HASH =
  process.env.NEXT_PUBLIC_CF_ACCOUNT_HASH || process.env.CF_ACCOUNT_HASH || "";
function cfUrl(cfImageId: string, variant = "card") {
  if (!CF_ACCOUNT_HASH) return null;
  return `https://imagedelivery.net/${CF_ACCOUNT_HASH}/${cfImageId}/${variant}`;
}
function bestImg(c: Pick<CardRow, "cf_image_id" | "src_url">) {
  if (c.cf_image_id) {
    return (
      cfUrl(c.cf_image_id, "card") ||
      cfUrl(c.cf_image_id, "public") ||
      cfUrl(c.cf_image_id, "category")
    );
  }
  return c.src_url || null;
}
function fmtUsdCents(n?: number | null) {
  if (n == null) return null;
  return (n / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/* ---------------- page ---------------- */
export default async function SportsCardDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  await searchParams; // (reserved)
  const wanted = decodeURIComponent(id ?? "").trim();

  // Resolve by exact id; fallback to canonical_key (case-insensitive)
  const card =
    (
      await db.execute<CardRow>(sql`
        WITH pick AS (
          SELECT *
          FROM sc_cards
          WHERE id = ${wanted}
          LIMIT 1
        ), fallback AS (
          SELECT *
          FROM sc_cards
          WHERE lower(canonical_key) = lower(${wanted})
          LIMIT 1
        ), chosen AS (
          SELECT * FROM pick
          UNION ALL
          SELECT * FROM fallback WHERE NOT EXISTS (SELECT 1 FROM pick)
          LIMIT 1
        )
        SELECT
          c.id,
          c.player,
          c.team,
          c.sport,
          c.year,
          c.set_name,
          c.number,
          c.source,
          c.source_url,
          c.canonical_key,
          setpick.set_id,
          img.cf_image_id,
          img.src_url
        FROM chosen c
        -- derive set_id from sc_sets
        LEFT JOIN LATERAL (
          SELECT s.id AS set_id
          FROM sc_sets s
          WHERE lower(s.sport) = lower(c.sport)
            AND s.name = c.set_name
            AND ( (s.year IS NOT DISTINCT FROM c.year) OR s.year IS NULL )
          ORDER BY s.year DESC NULLS LAST
          LIMIT 1
        ) AS setpick ON TRUE
        -- pick hero image
        LEFT JOIN LATERAL (
          SELECT i.cf_image_id, i.src_url
          FROM sc_images i
          WHERE i.card_id = c.id
          ORDER BY i.is_primary DESC, i.id ASC
          LIMIT 1
        ) AS img ON TRUE
      `)
    ).rows?.[0] ?? null;

  if (!card) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold text-white">Card not found</h1>
        <p className="text-white/70 text-sm break-all">Tried: <code>{wanted}</code></p>
        <div className="flex gap-4">
          <Link href="/categories/sports/cards" className="text-sky-300 hover:underline">
            ← Back to all cards
          </Link>
          <Link href="/categories/sports/sets" className="text-sky-300 hover:underline">
            ← Browse sets
          </Link>
        </div>
      </section>
    );
  }

  const hero = bestImg(card);
  const setHref = card.set_id
    ? `/categories/sports/sets/${encodeURIComponent(card.set_id)}`
    : card.set_name
    ? `/categories/sports/sets/${encodeURIComponent(card.set_name)}`
    : null;

  // Pull a representative price snapshot (from your scp_* tables)
  const price =
    (
      await db.execute<PricePick>(sql`
        SELECT
          p.scp_id,
          p.console_name,
          p.product_name,
          to_char(p.release_date, 'YYYY-MM-DD') AS release_date,
          p.sales_volume,
          to_char(p.last_seen, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_seen,
          pr.loose_price,
          pr.graded_price,
          pr.new_price,
          pr.cib_price
        FROM scp_products p
        LEFT JOIN scp_prices pr ON pr.scp_id = p.scp_id
        WHERE p.card_id = ${card.id}
        ORDER BY p.sales_volume DESC NULLS LAST, p.last_seen DESC NULLS LAST
        LIMIT 1
      `)
    ).rows?.[0] ?? null;

  // eBay Snapshot (sports)
  const ebay = await getLatestEbaySnapshot("sports", card.id, "all");
  const money = (c?: number | null) => (c == null ? "—" : `$${(c / 100).toFixed(2)}`);

  const subtitleBits = [
    card.sport ? card.sport[0].toUpperCase() + card.sport.slice(1) : undefined,
    card.year != null ? String(card.year) : undefined,
    card.set_name ?? undefined,
    card.number ? `#${card.number}` : undefined,
  ].filter(Boolean);

  return (
    <article className="grid gap-6 md:grid-cols-2">
      {/* image */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-2 overflow-hidden">
        <div className="relative w-full" style={{ aspectRatio: "3 / 4" }}>
          {hero ? (
            <Image
              src={hero}
              alt={card.player ?? card.id}
              fill
              unoptimized
              className="object-contain"
              sizes="(max-width: 768px) 100vw, 50vw"
              priority
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-white/70">No image</div>
          )}
        </div>
      </div>

      {/* details */}
      <div className="grid gap-4">
        {/* top line: set link */}
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
        </div>

        {/* headline */}
        <h1 className="text-2xl font-bold text-white">
          {card.player ?? card.id}
        </h1>
        <div className="text-sm text-white/70">{subtitleBits.join(" • ")}</div>

        {/* quick facts */}
        <div className="grid grid-cols-2 gap-2 text-sm text-white/90">
          {card.team && (
            <div>
              <span className="text-white/70">Team:</span> {card.team}
            </div>
          )}
          {card.number && (
            <div>
              <span className="text-white/70">Card #:</span> {card.number}
            </div>
          )}
          {card.canonical_key && (
            <div className="col-span-2 break-all">
              <span className="text-white/70">Canonical Key:</span> {card.canonical_key}
            </div>
          )}
          {card.source && (
            <div className="col-span-2">
              <span className="text-white/70">Source:</span>{" "}
              {card.source_url ? (
                <a href={card.source_url} target="_blank" className="text-sky-300 hover:underline">
                  {card.source}
                </a>
              ) : (
                card.source
              )}
            </div>
          )}
        </div>

        {/* price snapshot (from scp_* tables) */}
        {price ? (
          <section className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Price Snapshot</h2>
              <div className="text-xs text-white/60">
                {price.last_seen ? `Last seen: ${price.last_seen}` : ""}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-sm text-white/80">Loose</div>
                <div className="mt-1 text-lg font-semibold text-white">
                  {fmtUsdCents(price.loose_price) ?? "—"}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-sm text-white/80">CIB</div>
                <div className="mt-1 text-lg font-semibold text-white">
                  {fmtUsdCents(price.cib_price) ?? "—"}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-sm text-white/80">New/Sealed</div>
                <div className="mt-1 text-lg font-semibold text-white">
                  {fmtUsdCents(price.new_price) ?? "—"}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-sm text-white/80">Graded</div>
                <div className="mt-1 text-lg font-semibold text-white">
                  {fmtUsdCents(price.graded_price) ?? "—"}
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-white/80 md:grid-cols-2">
              <div>
                <span className="text-white/60">Product:</span>{" "}
                {price.product_name ?? price.scp_id}
              </div>
              <div>
                <span className="text-white/60">Console/Line:</span>{" "}
                {price.console_name ?? "—"}
              </div>
              <div>
                <span className="text-white/60">Release:</span>{" "}
                {price.release_date ?? "—"}
              </div>
              <div>
                <span className="text-white/60">Sales Volume:</span>{" "}
                {price.sales_volume ?? "—"}
              </div>
            </div>
          </section>
        ) : null}

        {/* eBay Snapshot */}
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
                Median: <span className="font-semibold">{money(ebay.median_cents)}</span>{" "}
                {ebay.sample_count ? (
                  <span className="text-white/60">• n={ebay.sample_count}</span>
                ) : null}
              </div>
              <div className="text-sm text-white/80">
                IQR: {money(ebay.p25_cents)} – {money(ebay.p75_cents)}
              </div>
              <div className="text-xs text-white/60 mt-1">
                Source: eBay Browse API (US, USD; filtered and outliers pruned)
              </div>
            </div>
          </section>
        )}

        {/* back links */}
        <div className="mt-2 flex gap-4">
          <Link href="/categories/sports/cards" className="text-sky-300 hover:underline">
            ← Back to cards
          </Link>
          {setHref && (
            <Link href={setHref} className="text-sky-300 hover:underline">
              ← Back to set
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
