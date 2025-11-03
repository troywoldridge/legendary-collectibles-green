// src/app/api/ygo/search/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchRow = {
  id: string;         // ygo_cards.card_id
  name: string;
  type: string | null;
  attribute: string | null;
  race: string | null;
  thumb: string | null;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const qRaw = searchParams.get("q") ?? "";
  const q = qRaw.trim();

  if (!q) return NextResponse.json({ results: [] });

  try {
    // Prefer exact id / exact name, then prefix, then substring matches.
    const rows = (
      await db.execute<SearchRow>(sql`
        WITH needle AS (SELECT ${q}::text AS q)
        SELECT
          c.card_id AS id,
          c.name,
          c.type,
          c.attribute,
          c.race,
          img.thumb
        FROM ygo_cards c
        CROSS JOIN needle
        LEFT JOIN LATERAL (
          SELECT i.image_url_small AS thumb
          FROM ygo_card_images i
          WHERE i.card_id = c.card_id
          ORDER BY (CASE WHEN i.image_url_small IS NOT NULL THEN 0 ELSE 1 END)
          LIMIT 1
        ) img ON TRUE
        WHERE
          c.card_id = needle.q
          OR c.name ILIKE '%' || needle.q || '%'
        ORDER BY
          CASE
            WHEN c.card_id = needle.q THEN 0
            WHEN LOWER(c.name) = LOWER(needle.q) THEN 1
            WHEN LOWER(c.name) LIKE LOWER(needle.q) || '%' THEN 2
            ELSE 3
          END,
          c.name ASC
        LIMIT 15
      `)
    ).rows;

    // Simple shape for client
    return NextResponse.json({ results: rows }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("YGO search error:", err);
    return NextResponse.json({ results: [], error: "Search failed" }, { status: 500 });
  }
}
