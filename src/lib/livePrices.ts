// src/lib/livePrices.ts
import "server-only";

import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export type GameId = "pokemon" | "yugioh" | "mtg";

export type LivePrice = {
  amount: number; // ALWAYS dollars (e.g. 3.25)
  currency: "USD";
  source: string; // debug label: which vendor/field we used
};

/**
 * Parse numeric-ish DB values robustly.
 */
function num(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalize "unknown unit" numeric values into USD dollars.
 *
 * Heuristic:
 * - If it's an integer >= 100, treat it as cents (586 -> 5.86)
 * - Otherwise treat it as dollars
 */
function usd(v: string | number | null | undefined): number | null {
  const n = num(v);
  if (n == null) return null;
  if (Number.isInteger(n) && n >= 100) return n / 100;
  return n;
}

/* ---------------- Pokemon: tcg_card_prices_tcgplayer (CURRENT SCHEMA) ---------------- */

type CanonVariant = "normal" | "holofoil" | "reverse_holofoil" | "first_edition" | "promo";

function normalizeVariantType(input: unknown): CanonVariant {
  const s = String(input ?? "").trim().toLowerCase();
  if (!s) return "normal";

  if (s === "normal") return "normal";
  if (s === "holo" || s === "holofoil") return "holofoil";
  if (
    s === "reverse" ||
    s === "reverse_holo" ||
    s === "reverseholo" ||
    s === "reverse_holofoil" ||
    s === "reverse_holofoil"
  )
    return "reverse_holofoil";
  if (s === "first" || s === "firstedition" || s === "first_edition") return "first_edition";
  if (s === "promo" || s === "wpromo" || s === "w_promo") return "promo";

  return "normal";
}

async function getPokemonPrice(cardId: string, variantType?: string | null): Promise<LivePrice | null> {
  const vt = normalizeVariantType(variantType);

  const rows =
    (
      await db.execute<{
        updated_at: string | null;
        variant_type: string | null;

        // “wide” variant columns (text dollars)
        normal: string | null;
        holofoil: string | null;
        reverse_holofoil: string | null;
        first_edition_holofoil: string | null;
        first_edition_normal: string | null;

        // numeric fallbacks
        market_price: string | number | null;
        mid_price: string | number | null;
        low_price: string | number | null;
        high_price: string | number | null;
      }>(sql`
        SELECT
          updated_at,
          variant_type,
          normal,
          holofoil,
          reverse_holofoil,
          first_edition_holofoil,
          first_edition_normal,
          market_price,
          mid_price,
          low_price,
          high_price
        FROM public.tcg_card_prices_tcgplayer
        WHERE card_id = ${cardId}
        ORDER BY
          CASE
            -- exact match first
            WHEN btrim(COALESCE(variant_type,'')) = ${vt} THEN 0

            -- for "normal", treat NULL/'' as a match
            WHEN ${vt} = 'normal' AND (variant_type IS NULL OR btrim(variant_type) = '') THEN 1

            ELSE 2
          END,
          updated_at DESC NULLS LAST
        LIMIT 5
      `)
    ).rows ?? [];

  if (!rows.length) return null;

  // Prefer an exact row match; otherwise fallback to first row (usually the blank/normal row)
  const exact = rows.find((r) => (r.variant_type ?? "").trim() === vt) ?? null;
  const blank = rows.find((r) => !String(r.variant_type ?? "").trim()) ?? null;
  const row = exact ?? (vt === "normal" ? blank : null) ?? rows[0];

  // Pick the best “wide” field for the selected variant
  let wide: string | null = null;

  if (vt === "normal") wide = row.normal;
  else if (vt === "holofoil") wide = row.holofoil;
  else if (vt === "reverse_holofoil") wide = row.reverse_holofoil;
  else if (vt === "first_edition") wide = row.first_edition_holofoil ?? row.first_edition_normal ?? null;
  else if (vt === "promo") wide = row.holofoil ?? row.normal ?? null;

  const candidates: Array<{ v: number | null; label: string }> = [
    // wide/variant-specific first
    { v: usd(wide), label: `tcgplayer.${vt}` },

    // then generic numeric fallbacks (if wide is empty)
    { v: usd(row.market_price), label: "tcgplayer.market_price" },
    { v: usd(row.mid_price), label: "tcgplayer.mid_price" },
    { v: usd(row.low_price), label: "tcgplayer.low_price" },
    { v: usd(row.high_price), label: "tcgplayer.high_price" },

    // finally, for promos we sometimes still want to fall back to normal/holo
    { v: usd(row.holofoil), label: "tcgplayer.holofoil" },
    { v: usd(row.normal), label: "tcgplayer.normal" },
    { v: usd(row.reverse_holofoil), label: "tcgplayer.reverse_holofoil" },
  ];

  const best = candidates.find((c) => c.v != null);
  if (!best || best.v == null) return null;

  return { amount: best.v, currency: "USD", source: best.label };
}

/* ---------------- YGO: ygo_card_prices ---------------- */

async function getYgoPrice(cardId: string): Promise<LivePrice | null> {
  const row =
    (
      await db.execute<{
        tcgplayer_price: string | null;
        cardmarket_price: string | null;
        ebay_price: string | null;
        amazon_price: string | null;
        coolstuffinc_price: string | null;
      }>(sql`
        SELECT
          tcgplayer_price,
          cardmarket_price,
          ebay_price,
          amazon_price,
          coolstuffinc_price
        FROM ygo_card_prices
        WHERE card_id = ${cardId}
        LIMIT 1
      `)
    ).rows?.[0] ?? null;

  if (!row) return null;

  const candidates: Array<{ v: number | null; label: string }> = [
    { v: usd(row.tcgplayer_price), label: "ygo.tcgplayer_price" },
    { v: usd(row.cardmarket_price), label: "ygo.cardmarket_price" },
    { v: usd(row.ebay_price), label: "ygo.ebay_price" },
    { v: usd(row.amazon_price), label: "ygo.amazon_price" },
    { v: usd(row.coolstuffinc_price), label: "ygo.coolstuffinc_price" },
  ];

  const best = candidates.find((c) => c.v != null);
  if (!best || best.v == null) return null;

  return { amount: best.v, currency: "USD", source: best.label };
}

/* ---------------- MTG: mtg_prices_effective ---------------- */

async function getMtgPrice(cardId: string): Promise<LivePrice | null> {
  const row =
    (
      await db.execute<{ effective_usd: string | null }>(sql`
        SELECT effective_usd
        FROM mtg_prices_effective
        WHERE scryfall_id = ${cardId}
        LIMIT 1
      `)
    ).rows?.[0] ?? null;

  const v = usd(row?.effective_usd ?? null);
  if (v == null) return null;

  return { amount: v, currency: "USD", source: "mtg.effective_usd" };
}

/* ---------------- Entry point ---------------- */

export function normalizeGame(raw: string): GameId | null {
  const v = raw.toLowerCase();
  if (v === "pokemon") return "pokemon";
  if (v === "mtg" || v === "magic" || v === "magic_the_gathering") return "mtg";
  if (v === "yugioh" || v === "ygo") return "yugioh";
  return null;
}

export async function getLivePriceForCard(
  game: GameId,
  cardId: string,
  variantType?: string | null,
): Promise<LivePrice | null> {
  if (!cardId) return null;

  switch (game) {
    case "pokemon":
      return getPokemonPrice(cardId, variantType);
    case "yugioh":
      return getYgoPrice(cardId);
    case "mtg":
      return getMtgPrice(cardId);
    default:
      return null;
  }
}
