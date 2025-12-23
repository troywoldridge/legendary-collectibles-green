// src/app/api/store/listings/by-card/route.ts
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const game = (url.searchParams.get("game") || "").trim();
  const cardId = (url.searchParams.get("cardId") || "").trim();

  if (!game || !cardId) {
    return NextResponse.json({ error: "game and cardId are required" }, { status: 400 });
  }

  const res = await db.execute<{
    id: string;
    title: string;
    price_cents: number;
    currency: string;
    quantity: number;
    condition: string | null;
    grading_company: string | null;
    grade_label: string | null;
    cert_number: string | null;
    primary_image_url: string | null;
    featured: boolean;
    created_at: string;
  }>(sql`
    SELECT
      id,
      title,
      price_cents,
      currency,
      quantity,
      condition,
      grading_company,
      grade_label,
      cert_number,
      primary_image_url,
      featured,
      created_at::text
    FROM public.store_listings
    WHERE status = 'active'
      AND game = ${game}
      AND card_id = ${cardId}
      AND quantity > 0
    ORDER BY featured DESC, price_cents ASC, created_at DESC
    LIMIT 25
  `);

  return NextResponse.json({ listings: res.rows ?? [] });
}
