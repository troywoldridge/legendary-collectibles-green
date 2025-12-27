// src/lib/livePrices.ts
import "server-only";

import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export type GameId = "pokemon" | "yugioh" | "mtg";

export type LivePrice = {
  amount: number;       // ALWAYS dollars (e.g. 3.25)
  currency: "USD";
  source: string;       // debug label: which vendor/field we used
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
 * Why:
 * - Some tables store dollars as decimals: 5.86
 * - Some tables store cents as integers: 586
 * - If we ever read cents and render as dollars, you get 100x prices.
 *
 * Heuristic:
 * - If it's an integer >= 100, we treat it as cents (586 -> 5.86)
 * - Otherwise treat it as dollars
 *
 * Notes:
 * - This is intentionally conservative to prevent 100x inflation.
 */
function usd(v: string | number | null | undefined): number | null {
  const n = num(v);
  if (n == null) return null;

  // Treat large integers as cents
  if (Number.isInteger(n) && n >= 100) return n / 100;

  return n;
}

/* ---------------- Pokemon: tcg_card_prices_tcgplayer ---------------- */

async function getPokemonPrice(cardId: string): Promise<LivePrice | null> {
  const row =
    (
      await db.execute<{
        market_normal: string | null;
        market_holofoil: string | null;
        market_reverse_holofoil: string | null;
        normal: string | null;
        holofoil: string | null;
        reverse_holofoil: string | null;
      }>(sql`
        SELECT
          market_normal,
          market_holofoil,
          market_reverse_holofoil,
          normal,
          holofoil,
          reverse_holofoil
        FROM tcg_card_prices_tcgplayer
        WHERE card_id = ${cardId}
        LIMIT 1
      `)
    ).rows?.[0] ?? null;

  if (!row) return null;

  // IMPORTANT: use usd() not num()
  const candidates: Array<{ v: number | null; label: string }> = [
    { v: usd(row.market_normal), label: "tcgplayer.market_normal" },
    { v: usd(row.market_holofoil), label: "tcgplayer.market_holofoil" },
    { v: usd(row.market_reverse_holofoil), label: "tcgplayer.market_reverse_holofoil" },
    { v: usd(row.normal), label: "tcgplayer.normal" },
    { v: usd(row.holofoil), label: "tcgplayer.holofoil" },
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

  // Also hardened: if any YGO source ever stores cents, we won't blow up UI.
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
): Promise<LivePrice | null> {
  if (!cardId) return null;

  switch (game) {
    case "pokemon":
      return getPokemonPrice(cardId);
    case "yugioh":
      return getYgoPrice(cardId);
    case "mtg":
      return getMtgPrice(cardId);
    default:
      return null;
  }
}
