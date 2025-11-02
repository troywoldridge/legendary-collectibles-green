import "server-only";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

type CardRow = {
  id: string;
  name: string | null;
  set_id: string | null;
  set_name: string | null;
  series: string | null;
  rarity: string | null;
  small_image: string | null;
  large_image: string | null;
};

type AttackRow = {
  name: string | null;
  text: string | null;
  damage: string | null;
};
type AbilityRow = { name: string | null; text: string | null; type: string | null };
type LegalityRow = { format: string | null; status: string | null };
type PriceTcgRow = { variant: string | null; market: number | null; url: string | null };
type PriceCmkRow = { trendprice: number | null; url: string | null };

const FALLBACK_IMG =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

function bestImg(c: Pick<CardRow, "small_image" | "large_image">): string {
  return c.large_image || c.small_image || FALLBACK_IMG;
}
function cardAlt(c: Pick<CardRow, "name" | "set_name">): string {
  return `${c.name ?? "Card"}${c.set_name ? " – " + c.set_name : ""}`;
}

export default async function PokemonCardDetailPage({ params }: { params: Params }) {
  const { id } = params;

  const cardRes = await db.execute<CardRow>(sql`
    SELECT
      id,
      name,
      set_id,
      set_name,
      series,
      rarity,
      small_image,
      large_image
    FROM tcg_cards
    WHERE id = ${id}
    LIMIT 1
  `);
  const card = cardRes.rows?.[0];
  if (!card) notFound();

  const [attacksRes, abilitiesRes, legalitiesRes, priceTcgRes, priceCmkRes] =
    await Promise.all([
      db.execute<AttackRow>(sql`
        SELECT name, text, damage
        FROM tcg_card_attacks
        WHERE cardid = ${id}
        ORDER BY "index" ASC
      `),
      db.execute<AbilityRow>(sql`
        SELECT name, text, type
        FROM tcg_card_abilities
        WHERE cardid = ${id}
        ORDER BY "index" ASC
      `),
      db.execute<LegalityRow>(sql`
        SELECT format, status
        FROM tcg_card_legalities
        WHERE cardid = ${id}
        ORDER BY format ASC
      `),
      db.execute<PriceTcgRow>(sql`
        SELECT variant, market, url
        FROM tcg_card_prices_tcgplayer
        WHERE cardid = ${id}
        ORDER BY updatedat DESC
        LIMIT 5
      `),
      db.execute<PriceCmkRow>(sql`
        SELECT trendprice, url
        FROM tcg_card_prices_cardmarket
        WHERE cardid = ${id}
        ORDER BY updatedat DESC
        LIMIT 1
      `),
    ]);

  const attacks = attacksRes.rows ?? [];
  const abilities = abilitiesRes.rows ?? [];
  const legalities = legalitiesRes.rows ?? [];
  const priceTcg = priceTcgRes.rows ?? [];
  const priceCmk = priceCmkRes.rows?.[0];

  const heroSrc = bestImg(card);

  return (
    <article className="grid gap-6 md:grid-cols-2">
      <div className="rounded border bg-white/5 border-white/10 p-2">
        <div className="relative w-full" style={{ aspectRatio: "3 / 4" }}>
          <Image
            src={heroSrc}
            alt={cardAlt(card)}
            fill
            className="object-contain"
            sizes="(max-width: 768px) 100vw, 50vw"
            priority
          />
        </div>
      </div>

      <div className="grid gap-3 text-white">
        <div className="text-sm text-white/70">
          Set:{" "}
          <Link
            href={`/categories/pokemon/sets/${encodeURIComponent(card.set_id ?? "")}`}
            className="text-sky-300 hover:underline"
          >
            {card.set_name ?? "Unknown"}
          </Link>
        </div>

        <h1 className="text-2xl font-bold">
          {card.name ?? "Untitled"}
        </h1>

        <div className="text-sm text-white/70">
          {(card.series ?? "").trim()}
          {card.series && card.set_name ? " • " : ""}
          {(card.set_name ?? "").trim()}
        </div>
        {card.rarity && <div className="text-sm">{card.rarity}</div>}

        {abilities.length > 0 && (
          <section>
            <h2 className="font-semibold">Abilities</h2>
            <ul className="mt-1 grid gap-2">
              {abilities.map((a, i) => (
                <li key={i} className="rounded border border-white/10 bg-white/5 p-2">
                  <div className="text-sm font-medium">
                    {a.name} {a.type ? <span className="text-xs text-white/70">{a.type}</span> : null}
                  </div>
                  <p className="text-sm text-white/80">{a.text}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {attacks.length > 0 && (
          <section>
            <h2 className="font-semibold">Attacks</h2>
            <ul className="mt-1 grid gap-2">
              {attacks.map((a, i) => (
                <li key={i} className="rounded border border-white/10 bg-white/5 p-2">
                  <div className="text-sm font-medium">
                    {a.name} {a.damage ? <span className="text-xs text-white/70">({a.damage})</span> : null}
                  </div>
                  <p className="text-sm text-white/80">{a.text}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {legalities.length > 0 && (
          <section>
            <h2 className="font-semibold">Legalities</h2>
            <ul className="mt-1 flex flex-wrap gap-2">
              {legalities.map((l, i) => (
                <li key={i} className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs">
                  {l.format}: {l.status}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="grid gap-2">
          <h2 className="font-semibold">Prices</h2>

          {priceTcg.length > 0 && (
            <div className="text-sm">
              <div className="font-medium">TCGplayer</div>
              <ul className="mt-1 grid gap-1">
                {priceTcg.map((p, i) => (
                  <li key={i} className="flex items-center justify-between rounded border border-white/10 bg-white/5 px-2 py-1">
                    <span>{p.variant}</span>
                    <span className="text-white/70">Market: {p.market ?? "—"}</span>
                    {p.url ? (
                      <a className="text-sky-300 hover:underline" href={p.url} target="_blank" rel="noreferrer">
                        View
                      </a>
                    ) : (
                      <span />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {priceCmk && (
            <div className="text-sm">
              <div className="font-medium">Cardmarket</div>
              <div className="mt-1 rounded border border-white/10 bg-white/5 px-2 py-1 flex items-center justify-between">
                <span>Trend: {priceCmk.trendprice ?? "—"}</span>
                {priceCmk.url ? (
                  <a className="text-sky-300 hover:underline" href={priceCmk.url} target="_blank" rel="noreferrer">
                    View
                  </a>
                ) : (
                  <span />
                )}
              </div>
            </div>
          )}
        </section>

        <div className="mt-2">
          <Link
            href={`/categories/pokemon/sets/${encodeURIComponent(card.set_id ?? "")}`}
            className="text-sky-300 hover:underline"
          >
            ← Back to set
          </Link>
        </div>
      </div>
    </article>
  );
}
