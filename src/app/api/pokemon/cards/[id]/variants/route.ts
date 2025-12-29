// src/app/api/pokemon/cards/[id]/variants/route.ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type VariantRow = {
  card_id: string;
  normal: boolean | null;
  reverse: boolean | null;
  holo: boolean | null;
  first_edition: boolean | null;
  w_promo: boolean | null;
};

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const cardId = decodeURIComponent(id ?? "").trim();

  const row =
    (
      await db.execute<VariantRow>(sql`
        SELECT card_id, normal, reverse, holo, first_edition, w_promo
        FROM public.tcg_card_variants
        WHERE card_id = ${cardId}
        LIMIT 1;
      `)
    ).rows?.[0] ?? null;

  return NextResponse.json({
    cardId,
    variants: row,
  });
}
