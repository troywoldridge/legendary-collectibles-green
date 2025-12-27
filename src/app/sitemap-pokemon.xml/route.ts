// src/app/sitemap-pokemon.xml/route.ts
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
        SELECT id
        FROM public.tcg_cards
        WHERE id IS NOT NULL
        ORDER BY id
      `)
    ).rows ?? [];

  // cards + prices (19818 * 2 = 39636 ≈ 40k)
  const urls = rows.flatMap((r) => {
    const id = encodeURIComponent(r.id);
    return [
      {
        loc: `${BASE}/categories/pokemon/cards/${id}`,
        changefreq: "monthly",
        priority: "0.7",
      },
      {
        loc: `${BASE}/categories/pokemon/cards/${id}/prices`,
        changefreq: "weekly",
        priority: "0.6",
      },
    ];
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
