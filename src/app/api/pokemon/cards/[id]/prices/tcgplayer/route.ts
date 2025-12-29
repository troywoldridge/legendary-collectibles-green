// src/app/api/pokemon/cards/[id]/prices/tcgplayer/route.ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PriceRow = {
  card_id: string;
  variant_type: string | null;
  low_price: number | null;
  mid_price: number | null;
  high_price: number | null;
  market_price: number | null;
  currency: string | null;
  updated_at: string | null;
};

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const cardId = decodeURIComponent(id ?? "").trim();

  const rows = await db.execute<PriceRow>(sql`
    SELECT
      card_id,
      variant_type,
      low_price,
      mid_price,
      high_price,
      market_price,
      currency,
      updated_at
    FROM public.tcg_card_prices_tcgplayer
    WHERE card_id = ${cardId}
    ORDER BY variant_type ASC NULLS LAST;
  `);

  return NextResponse.json({
    cardId,
    prices: rows.rows ?? [],
  });
}
