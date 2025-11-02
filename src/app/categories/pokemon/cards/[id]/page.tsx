import "server-only";
import Link from "next/link";
import Image from "next/image";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Shape based on your tcg_cards schema */
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
  regulation_mark: string | null;
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

type LegalityRow = {
  format: string | null;
  legality: string | null;
};

/* ------ helpers ------ */
function bestImg(c: CardRow) {
  return c.large_image || c.small_image || null;
}

/** try to interpret comma/pipe/semicolon lists or JSON arrays stored as text */
function splitList(s?: string | null): string[] {
  if (!s) return [];
  const t = s.trim();
  if (!t) return [];
  // JSON array?
  if ((t.startsWith("[") && t.endsWith("]")) || (t.startsWith("{") && t.endsWith("}"))) {
    try {
      const parsed = JSON.parse(t);
      if (Array.isArray(parsed)) return parsed.map(String);
      if (parsed && typeof parsed === "object") return Object.values(parsed).map(String);
    } catch {}
  }
  return t.split(/[,;|]/g).map((x) => x.trim()).filter(Boolean);
}

export default async function PokemonCardDetailPage({
  params,
}: {
  params: { id: string };
}) {
  // make the URL param as forgiving as possible
  const raw = params.id ?? "";
  const wanted = decodeURIComponent(raw).trim();

  // 1) exact ID
  let card = (await db.execute<CardRow>(sql`
    SELECT *
    FROM tcg_cards
    WHERE id = ${wanted}
    LIMIT 1
  `)).rows?.[0];

  // 2) case/whitespace-insensitive fallback (covers e.g. "BASE6-67", stray spaces)
  if (!card) {
    card = (await db.execute<CardRow>(sql`
      SELECT *
      FROM tcg_cards
      WHERE lower(trim(id)) = lower(${wanted})
      LIMIT 1
    `)).rows?.[0];
  }

  if (!card) {
    // Final friendly not-found
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

  // optional: set legalities
  let legalities: LegalityRow[] = [];
  if (card.set_id) {
    legalities =
      (await db.execute<LegalityRow>(sql`
        SELECT format, legality
        FROM tcg_sets_legalities
        WHERE set_id = ${card.set_id}
        ORDER BY format ASC
      `)).rows ?? [];
  }

  const hero = bestImg(card);
  const setHref = card.set_name
    ? `/categories/pokemon/sets/${encodeURIComponent(card.set_name)}`
    : card.set_id
    ? `/categories/pokemon/sets/${encodeURIComponent(card.set_id)}`
    : null;

  const chipsTypes = splitList(card.types);
  const chipsSubtypes = splitList(card.subtypes);
  const rulesList = splitList(card.rules);
  const evoTo = splitList(card.evolves_to);

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
            <div className="absolute inset-0 grid place-items-center text-white/70">No image</div>
          )}
        </div>
      </div>

      {/* details */}
      <div className="grid gap-4">
        {/* tiny crumbs */}
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

        <h1 className="text-2xl font-bold text-white">
          {card.name ?? card.id}
        </h1>

        <div className="text-sm text-white/70">
          {[
            card.series || undefined,
            card.ptcgo_code ? `PTCGO: ${card.ptcgo_code}` : undefined,
            card.release_date ? `Released: ${card.release_date}` : undefined,
            card.regulation_mark ? `Regulation: ${card.regulation_mark}` : undefined,
          ]
            .filter(Boolean)
            .join(" • ")}
        </div>

        {/* quick facts */}
        <div className="grid grid-cols-2 gap-2 text-sm text-white/90">
          {card.rarity && <div><span className="text-white/70">Rarity:</span> {card.rarity}</div>}
          {card.artist && <div><span className="text-white/70">Artist:</span> {card.artist}</div>}
          {card.hp && <div><span className="text-white/70">HP:</span> {card.hp}</div>}
          {card.level && <div><span className="text-white/70">Level:</span> {card.level}</div>}
          {card.retreat_cost && <div className="col-span-2"><span className="text-white/70">Retreat Cost:</span> {card.retreat_cost}</div>}
          {card.converted_retreat_cost && <div className="col-span-2"><span className="text-white/70">Converted Retreat:</span> {card.converted_retreat_cost}</div>}
          {card.evolves_from && <div className="col-span-2"><span className="text-white/70">Evolves from:</span> {card.evolves_from}</div>}
          {evoTo.length > 0 && <div className="col-span-2"><span className="text-white/70">Evolves to:</span> {evoTo.join(", ")}</div>}
        </div>

        {/* chips */}
        {(chipsTypes.length > 0 || chipsSubtypes.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {chipsTypes.map((t, i) => (
              <span key={`t-${i}`} className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-xs text-white">
                {t}
              </span>
            ))}
            {chipsSubtypes.map((t, i) => (
              <span key={`st-${i}`} className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-xs text-white/90">
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
              {rulesList.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </section>
        )}

        {(card.ancient_trait_name || card.ancient_trait_text) && (
          <section className="rounded-lg border border-white/10 bg-white/5 p-3">
            <h2 className="font-semibold text-white">Ancient Trait</h2>
            <div className="text-sm text-white/90">
              {card.ancient_trait_name ? <div className="font-medium">{card.ancient_trait_name}</div> : null}
              {card.ancient_trait_text ? <p className="text-white/80 mt-1">{card.ancient_trait_text}</p> : null}
            </div>
          </section>
        )}

        {card.flavor_text && (
          <section className="rounded-lg border border-white/10 bg-white/5 p-3">
            <h2 className="font-semibold text-white">Flavor</h2>
            <p className="text-sm text-white/80">{card.flavor_text}</p>
          </section>
        )}

        {/* legalities pulled from tcg_sets_legalities */}
        {legalities.length > 0 && (
          <section className="rounded-lg border border-white/10 bg-white/5 p-3">
            <h2 className="font-semibold text-white">Set Legalities</h2>
            <ul className="mt-1 flex flex-wrap gap-2 text-xs">
              {legalities.map((l, i) => (
                <li key={i} className="rounded border border-white/15 bg-white/8 px-2 py-1 text-white/90">
                  {l.format}: {l.legality}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* external links */}
        <div className="mt-1 flex flex-wrap gap-3">
          {card.tcgplayer_url && (
            <a
              href={card.tcgplayer_url}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20"
            >
              View on TCGplayer
            </a>
          )}
          {card.cardmarket_url && (
            <a
              href={card.cardmarket_url}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20"
            >
              View on Cardmarket
            </a>
          )}
        </div>

        {/* back links */}
        <div className="mt-2 flex gap-4">
          <Link href="/categories/pokemon/cards" className="text-sky-300 hover:underline">
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
