import "server-only";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();

  const rows = await db.execute(sql`
    SELECT
      id,
      name,
      number,
      set_id,
      set_name,
      series,
      release_date,
      small_image,
      large_image,
      rarity,
      artist,
      regulation_mark,
      variant_normal,
      variant_reverse,
      variant_holo,
      variant_first_edition
    FROM tcg_cards
    WHERE source = 'tcgdex'
      AND lang = 'ja'
      AND (
        ${q === ""
          ? sql`true`
          : sql`name ILIKE ${"%" + q + "%"}
               OR set_name ILIKE ${"%" + q + "%"}
               OR series ILIKE ${"%" + q + "%"}
               OR number = ${q}`}
      )
    ORDER BY set_name ASC, number ASC
    LIMIT 50
  `);

  return NextResponse.json({ ok: true, cards: rows.rows ?? rows });
}
