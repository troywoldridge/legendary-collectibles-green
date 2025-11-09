import "server-only";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  name: string;
  type: string | null;
  attribute: string | null;
  race: string | null;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ results: [] }, { headers: { "Cache-Control": "no-store" } });

  try {
    // Exact ID > exact name > prefix > substring
    const rows =
      (
        await db.execute<Row>(sql`
          WITH needle AS (SELECT ${q}::text AS q)
          SELECT
            c.card_id AS id,
            c.name,
            c.type,
            c.attribute,
            c.race
          FROM ygo_cards c, needle
          WHERE c.card_id = needle.q
             OR c.name ILIKE '%' || needle.q || '%'
          ORDER BY
            CASE
              WHEN c.card_id = needle.q THEN 0
              WHEN LOWER(c.name) = LOWER(needle.q) THEN 1
              WHEN LOWER(c.name) LIKE LOWER(needle.q) || '%' THEN 2
              ELSE 3
            END,
            c.name ASC
          LIMIT 20
        `)
      ).rows ?? [];

    // Keep the same client shape (with thumb nullable)
    const results = rows.map((r) => ({ ...r, thumb: null as string | null }));
    return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[/api/ygo/search] error:", err);
    return NextResponse.json({ results: [], error: "Search failed" }, { status: 500 });
  }
}
