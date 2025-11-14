// src/lib/livePrices.ts
import "server-only";

import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export type GameId = "pokemon" | "yugioh" | "mtg";

export type LivePrice = {
  amount: number;       // e.g. 3.25
  currency: "USD";      // everything we pick is effectively USD right now
  source: string;       // debug label: which vendor/field we used
};

function num(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
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

  const candidates: Array<{ v: number | null; label: string }> = [
    { v: num(row.market_normal), label: "tcgplayer.market_normal" },
    { v: num(row.market_holofoil), label: "tcgplayer.market_holofoil" },
    { v: num(row.market_reverse_holofoil), label: "tcgplayer.market_reverse_holofoil" },
    { v: num(row.normal), label: "tcgplayer.normal" },
    { v: num(row.holofoil), label: "tcgplayer.holofoil" },
    { v: num(row.reverse_holofoil), label: "tcgplayer.reverse_holofoil" },
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
    { v: num(row.tcgplayer_price), label: "ygo.tcgplayer_price" },
    { v: num(row.cardmarket_price), label: "ygo.cardmarket_price" },
    { v: num(row.ebay_price), label: "ygo.ebay_price" },
    { v: num(row.amazon_price), label: "ygo.amazon_price" },
    { v: num(row.coolstuffinc_price), label: "ygo.coolstuffinc_price" },
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

  const v = num(row?.effective_usd ?? null);
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
