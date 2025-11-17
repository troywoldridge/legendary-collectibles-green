// src/app/api/collection/sparkline/route.ts
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type Point = { t: string; v: number | null };

function parseNum(v: string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawGame = (searchParams.get("game") ?? "pokemon").toLowerCase();
  const cardId = searchParams.get("cardId");
  // we still accept days param for future tweaks, but we always clamp to 90 in SQL
  const daysParam = Number(searchParams.get("days") ?? "90");
  const days = Number.isFinite(daysParam) && daysParam > 0
    ? Math.min(daysParam, 365)
    : 90;

  if (!cardId) {
    return NextResponse.json({ points: [] });
  }

  // --- Pokémon: tcg_card_prices_tcgplayer_history ---
  if (rawGame === "pokemon") {
    const rows = await db.execute<{
      captured_at: string;
      currency: string | null;
      normal: string | null;
      holofoil: string | null;
      reverse_holofoil: string | null;
    }>(sql`
      SELECT captured_at, currency, normal, holofoil, reverse_holofoil
      FROM tcg_card_prices_tcgplayer_history
      WHERE card_id = ${cardId}
        AND captured_at >= now() - INTERVAL '90 days'
      ORDER BY captured_at ASC
    `);

    const points: Point[] = (rows.rows ?? []).map((r) => {
      const nums = [r.normal, r.holofoil, r.reverse_holofoil]
        .map(parseNum)
        .filter((n): n is number => n != null);

      const v =
        nums.length > 0
          ? nums.reduce((a, b) => a + b, 0) / nums.length
          : null;

      return { t: r.captured_at, v };
    });

    return NextResponse.json({ points });
  }

  // --- Yu-Gi-Oh!: ygo_card_prices_history ---
  if (rawGame === "yugioh" || rawGame === "ygo") {
    const rows = await db.execute<{
      captured_at: string;
      tcgplayer_price: string | null;
      cardmarket_price: string | null;
      ebay_price: string | null;
      amazon_price: string | null;
      coolstuffinc_price: string | null;
    }>(sql`
      SELECT
        captured_at,
        tcgplayer_price,
        cardmarket_price,
        ebay_price,
        amazon_price,
        coolstuffinc_price
      FROM ygo_card_prices_history
      WHERE card_id = ${cardId}
        AND captured_at >= now() - INTERVAL '90 days'
      ORDER BY captured_at ASC
    `);

    const points: Point[] = (rows.rows ?? []).map((r) => {
      const nums = [
        r.tcgplayer_price,
        r.cardmarket_price,
        r.ebay_price,
        r.amazon_price,
        r.coolstuffinc_price,
      ]
        .map(parseNum)
        .filter((n): n is number => n != null);

      const v =
        nums.length > 0
          ? nums.reduce((a, b) => a + b, 0) / nums.length
          : null;

      return { t: r.captured_at, v };
    });

    return NextResponse.json({ points });
  }

  // --- MTG or other: no per-card history yet (we’ll wire this later) ---
  return NextResponse.json({ points: [] });
}
