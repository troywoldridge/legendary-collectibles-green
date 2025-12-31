// src/app/sitemap-pokemon.xml/route.ts
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

type UrlEntry = {
  loc: string;
  changefreq?: "daily" | "weekly" | "monthly" | "yearly";
  priority?: string;
  lastmod?: string;
};

export async function GET() {
  const now = new Date().toISOString();

  // Pull set ids
  const setRows =
    (
      await db.execute<{ id: string }>(sql`
        SELECT id
        FROM public.tcg_sets
        WHERE id IS NOT NULL
        ORDER BY id
      `)
    ).rows ?? [];

  // Pull card ids
  const cardRows =
    (
      await db.execute<{ id: string }>(sql`
        SELECT id
        FROM public.tcg_cards
        WHERE id IS NOT NULL
        ORDER BY id
      `)
    ).rows ?? [];

  const urls: UrlEntry[] = [];

  // --- Pokemon hub pages (important for indexing + canonicals) ---
  urls.push(
    {
      loc: `${BASE}/categories/pokemon`,
      changefreq: "weekly",
      priority: "0.8",
      lastmod: now,
    },
    {
      loc: `${BASE}/categories/pokemon/cards`,
      changefreq: "weekly",
      priority: "0.8",
      lastmod: now,
    },
    {
      loc: `${BASE}/categories/pokemon/sets`,
      changefreq: "weekly",
      priority: "0.9",
      lastmod: now,
    },
  );

  // --- Set pages ---
  for (const r of setRows) {
    const sid = encodeURIComponent(r.id);
    urls.push({
      loc: `${BASE}/categories/pokemon/sets/${sid}`,
      changefreq: "monthly",
      priority: "0.7",
      lastmod: now,
    });
  }

  // --- Card pages + price pages ---
  for (const r of cardRows) {
    const cid = encodeURIComponent(r.id);

    urls.push(
      {
        loc: `${BASE}/categories/pokemon/cards/${cid}`,
        changefreq: "monthly",
        priority: "0.7",
        lastmod: now,
      },
      {
        loc: `${BASE}/categories/pokemon/cards/${cid}/prices`,
        changefreq: "weekly",
        priority: "0.6",
        lastmod: now,
      },
    );
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${xmlEscape(u.loc)}</loc>
    <lastmod>${xmlEscape(u.lastmod ?? now)}</lastmod>
    ${u.changefreq ? `<changefreq>${u.changefreq}</changefreq>` : ""}
    ${u.priority ? `<priority>${u.priority}</priority>` : ""}
  </url>`,
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
