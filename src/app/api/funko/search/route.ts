// src/app/api/funko/search/route.ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function norm(v: unknown) {
  return String(v ?? "").trim();
}

function toInt(v: unknown, fallback: number, max: number) {
  const n = Number(String(v ?? ""));
  if (!Number.isFinite(n)) return fallback;
  const m = Math.floor(n);
  if (m < 0) return fallback;
  return Math.min(m, max);
}

/**
 * GET /api/funko/search?q=black%20panther&limit=24&offset=0
 * Optional:
 * - series=Marvel (filters by series text match)
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    const q = norm(url.searchParams.get("q"));
    const series = norm(url.searchParams.get("series"));

    const limit = Math.max(1, toInt(url.searchParams.get("limit"), 24, 50));
    const offset = toInt(url.searchParams.get("offset"), 0, 5000);

    // If no query, return a reasonable default (recently updated)
    if (!q) {
      const rows = await db.execute(sql`
        select
          id,
          name,
          franchise,
          series,
          line,
          number,
          edition,
          variant,
          is_chase as "isChase",
          is_exclusive as "isExclusive",
          exclusivity,
          release_year as "releaseYear",
          upc,
          description,
          image_small as "imageSmall",
          image_large as "imageLarge",
          source,
          source_id as "sourceId",
          updated_at as "updatedAt"
        from funko_items
        where
          (${series} = '' or series ilike '%' || ${series} || '%')
        order by updated_at desc
        limit ${limit} offset ${offset};
      `);

      const countRes = await db.execute(sql`
        select count(*)::int as total
        from funko_items
        where (${series} = '' or series ilike '%' || ${series} || '%');
      `);

      return NextResponse.json({
        ok: true,
        q: "",
        series: series || null,
        limit,
        offset,
        total: Number((countRes as any).rows?.[0]?.total ?? 0),
        items: (rows as any).rows ?? [],
      });
    }

    // Full-text search (fast, uses your GIN index)
    // Add an ILIKE fallback for short/edge queries (numbers, abbreviations)
    const rows = await db.execute(sql`
      with matches as (
        select
          id,
          name,
          franchise,
          series,
          line,
          number,
          edition,
          variant,
          is_chase as "isChase",
          is_exclusive as "isExclusive",
          exclusivity,
          release_year as "releaseYear",
          upc,
          description,
          image_small as "imageSmall",
          image_large as "imageLarge",
          source,
          source_id as "sourceId",
          updated_at as "updatedAt",
          ts_rank(
            to_tsvector('english', coalesce(search_text,'')),
            plainto_tsquery('english', ${q})
          ) as rank
        from funko_items
        where
          (${series} = '' or series ilike '%' || ${series} || '%')
          and (
            to_tsvector('english', coalesce(search_text,'')) @@ plainto_tsquery('english', ${q})
            or coalesce(name,'') ilike '%' || ${q} || '%'
            or coalesce(number,'') = ${q}
            or coalesce(upc,'') = ${q}
          )
      )
      select *
      from matches
      order by rank desc nulls last, "updatedAt" desc
      limit ${limit} offset ${offset};
    `);

    // Count total (for pagination UI)
    const countRes = await db.execute(sql`
      select count(*)::int as total
      from funko_items
      where
        (${series} = '' or series ilike '%' || ${series} || '%')
        and (
          to_tsvector('english', coalesce(search_text,'')) @@ plainto_tsquery('english', ${q})
          or coalesce(name,'') ilike '%' || ${q} || '%'
          or coalesce(number,'') = ${q}
          or coalesce(upc,'') = ${q}
        );
    `);

    return NextResponse.json({
      ok: true,
      q,
      series: series || null,
      limit,
      offset,
      total: Number((countRes as any).rows?.[0]?.total ?? 0),
      items: (rows as any).rows ?? [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "search_failed", message: e?.message || String(e) },
      { status: 500 },
    );
  }
}
