import "server-only";
import Image from "next/image";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import YgoCardSearch from "@/components/ygo/YgoCardSearch";

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
  race: string | null;       // Type (Fiend/Dragon/etc.)
  attribute: string | null;  // Attribute (DARK/LIGHT/etc.)
  archetype: string | null;
  ygoprodeck_url: string | null;
  linkval: number | null;
  scale: number | null;
  linkmarkers: string[] | null;
};

type ImageRow = {
  small: string | null;
  large: string | null;
};

type PriceRow = {
  tcgplayer: string | null;
  cardmarket: string | null;
  ebay: string | null;
  amazon: string | null;
  coolstuffinc: string | null;
};

type BanlistRow = {
  tcg: string | null;
  ocg: string | null;
  goat: string | null;
};

type SetEntry = {
  set_name: string;
  set_code: string | null;
  set_rarity: string | null;
  set_price: string | null; // optional column in your DB; if missing, will be null
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

/* ---------------- Data loaders ---------------- */
async function getCard(param: string): Promise<{
  card: CardRow | null;
  images: ImageRow[];
  prices: PriceRow | null;
  banlist: BanlistRow | null;
  sets: SetEntry[];
}> {
  const id = decodeURIComponent(param).trim();

  // Core card
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

  // Images (ordered: prefer large if exists)
  const images =
    (
      await db.execute<ImageRow>(sql`
        SELECT
          i.image_url_small AS small,
          i.image_url       AS large
        FROM ygo_card_images i
        WHERE i.card_id = ${id}
        ORDER BY (CASE WHEN i.image_url IS NOT NULL THEN 0 ELSE 1 END), i.image_url_small NULLS LAST
        LIMIT 6
      `)
    ).rows ?? [];

  // Prices
  const prices =
    (
      await db.execute<PriceRow>(sql`
        SELECT
          p.tcgplayer_price  AS tcgplayer,
          p.cardmarket_price AS cardmarket,
          p.ebay_price       AS ebay,
          p.amazon_price     AS amazon,
          p.coolstuffinc_price AS coolstuffinc
        FROM ygo_card_prices p
        WHERE p.card_id = ${id}
        LIMIT 1
      `)
    ).rows?.[0] ?? null;

  // Banlist
  const banlist =
    (
      await db.execute<BanlistRow>(sql`
        SELECT
          b.ban_tcg  AS tcg,
          b.ban_ocg  AS ocg,
          b.ban_goat AS goat
        FROM ygo_card_banlist b
        WHERE b.card_id = ${id}
        LIMIT 1
      `)
    ).rows?.[0] ?? null;

  // Sets the card appears in (use set_name for navigation)
  const sets =
    (
      await db.execute<SetEntry>(sql`
        SELECT
          s.set_name,
          s.set_code,
          s.set_rarity,
          -- Some exports include set_price; if your table lacks it, this will be NULL
          NULLIF(CAST(NULL AS text), '') AS set_price
        FROM ygo_card_sets s
        WHERE s.card_id = ${id}
        GROUP BY s.set_name, s.set_code, s.set_rarity
        ORDER BY s.set_name ASC, s.set_code ASC NULLS LAST
      `)
    ).rows ?? [];

  return { card, images, prices, banlist, sets };
}

/* ---------------- Page ---------------- */
export default async function YugiohCardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { card, images, prices, banlist, sets } = await getCard(id);

  /* ---------- Not found ---------- */
  if (!card) {
    return (
      <section className="space-y-6">
        {/* Search (also available in not-found) */}
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

  return (
    <section className="space-y-8">
      {/* Search at the top (clean, outside of the grid) */}
      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <div className="mb-2 text-sm font-semibold text-white">Find another card</div>
        <YgoCardSearch initialQuery={card.name} />
      </div>

      {/* Top: image left, info right */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: large card image */}
        <div className="lg:col-span-5">
          <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
            <div className="relative mx-auto aspect-[3/4] w-full max-w-md">
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

        {/* Right: title + tags + stats + sections */}
        <div className="lg:col-span-7 space-y-4">
          {/* Title + meta row */}
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

              {card.ygoprodeck_url && (
                <Link
                  href={card.ygoprodeck_url}
                  target="_blank"
                  className="text-sm text-sky-300 hover:underline"
                >
                  View on YGOPRODeck →
                </Link>
              )}
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

          {/* Prices */}
          <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Market Prices</h2>
              <div className="text-xs text-white/60">Shown in native market currency</div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {/* Left column */}
              <div className="space-y-3">
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-sm font-medium text-white">TCGplayer</div>
                  <div className="text-white/80">Price</div>
                  <div className="mt-1 text-lg font-semibold text-white">
                    {money(prices?.tcgplayer)}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-sm font-medium text-white">eBay</div>
                  <div className="text-white/80">Price</div>
                  <div className="mt-1 text-lg font-semibold text-white">
                    {money(prices?.ebay)}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-sm font-medium text-white">CoolStuffInc</div>
                  <div className="text-white/80">Price</div>
                  <div className="mt-1 text-lg font-semibold text-white">
                    {money(prices?.coolstuffinc)}
                  </div>
                </div>
              </div>

              {/* Right column */}
              <div className="space-y-3">
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-sm font-medium text-white">Cardmarket</div>
                  <div className="text-white/80">Price</div>
                  <div className="mt-1 text-lg font-semibold text-white">
                    {money(prices?.cardmarket)}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-sm font-medium text-white">Amazon</div>
                  <div className="text-white/80">Price</div>
                  <div className="mt-1 text-lg font-semibold text-white">
                    {money(prices?.amazon)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Banlist */}
          <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
            <h2 className="text-lg font-semibold text-white">Banlist</h2>
            {banlist?.tcg || banlist?.ocg || banlist?.goat ? (
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="text-xs text-white/60">TCG</div>
                  <div className="text-sm text-white">{banlist?.tcg ?? "—"}</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="text-xs text-white/60">OCG</div>
                  <div className="text-sm text-white">{banlist?.ocg ?? "—"}</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="text-xs text-white/60">GOAT</div>
                  <div className="text-sm text-white">{banlist?.goat ?? "—"}</div>
                </div>
              </div>
            ) : (
              <div className="mt-2 rounded-lg border border-white/10 bg-white/5 p-3 text-white/80">
                No current ban statuses recorded.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sets scroller */}
      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Sets</h2>
          <Link href="/categories/yugioh/sets" className="text-sm text-sky-300 hover:underline">
            Browse sets →
          </Link>
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
                  className="rounded-xl border border-white/10 bg-white/5 p-3 hover:border-white/20 hover:bg-white/10 transition"
                >
                  <div className="text-sm font-medium text-white line-clamp-1">{s.set_name}</div>
                  <div className="mt-1 text-xs text-white/70">
                    {s.set_rarity ?? "—"}
                    {s.set_price ? (
                      <span className="ml-2">
                        • {Number.isFinite(+s.set_price!) ? money(s.set_price!) : s.set_price}
                      </span>
                    ) : null}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Card text / effect */}
      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <h2 className="text-lg font-semibold text-white">Card Text</h2>
        <p className="mt-2 whitespace-pre-wrap text-white/90">
          {card.desc || "—"}
        </p>
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
        {firstSet && (
          <Link
            href={`/categories/yugioh/sets/${encodeURIComponent(firstSet)}/prices`}
            className="text-sky-300 hover:underline"
          >
            View set price overview →
          </Link>
        )}
      </div>
    </section>
  );
}
