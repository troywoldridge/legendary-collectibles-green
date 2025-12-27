// src/app/sitemap-mtg.xml/route.ts
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

const BASE =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
  "https://legendary-collectibles.com";

function xmlEscape(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export async function GET() {
  const now = new Date().toISOString();

  const rows =
    (
      await db.execute<{ id: string }>(sql`
        SELECT scryfall_id::text AS id
        FROM public.mtg_prices_scryfall_latest
        WHERE scryfall_id IS NOT NULL
        ORDER BY updated_at DESC NULLS LAST, scryfall_id
        LIMIT 50000
      `)
    ).rows ?? [];

  // For MTG we include ONLY the card page to keep ~50k
  const urls = rows.map((r) => {
    const id = encodeURIComponent(r.id);
    return {
      loc: `${BASE}/categories/mtg/cards/${id}`,
      changefreq: "monthly",
      priority: "0.7",
    };
  });

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${xmlEscape(u.loc)}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>
`;

  return new NextResponse(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
