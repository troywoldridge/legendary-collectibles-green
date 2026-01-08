import "server-only";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function norm(s: unknown) {
  return String(s ?? "").trim();
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cardKey = norm(searchParams.get("cardKey"));
  const grade = norm(searchParams.get("grade"));

  if (!cardKey || !grade) {
    return NextResponse.json({ error: "Missing cardKey or grade" }, { status: 400 });
  }

  const res = await db.execute(sql`
    SELECT
      as_of_date,
      card_key,
      grade,
      market_value_usd,
      range_low_usd,
      range_high_usd,
      last_sale_usd,
      last_sale_at,
      sales_count_180d,
      confidence
    FROM public.market_values_daily
    WHERE as_of_date = CURRENT_DATE
      AND card_key = ${cardKey}
      AND grade = ${grade}
    LIMIT 1
  `);

  return NextResponse.json({ row: (res as any).rows?.[0] ?? null });
}
