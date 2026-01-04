// src/app/sitemap-pokemon-2.xml/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
  "https://legendary-collectibles.com";

/**
 * Pick the route pattern your site actually uses for card detail pages.
 * - "category" => /categories/pokemon/cards/<cardId>
 * - "simple"   => /pokemon/cards/<cardId>
 */
const CARD_PATH_MODE: "category" | "simple" = "category";

function cardUrl(cardId: string) {
  const id = encodeURIComponent(cardId);
  if (CARD_PATH_MODE === "simple") return `${BASE}/pokemon/cards/${id}`;
  return `${BASE}/categories/pokemon/cards/${id}`;
}

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

  const result = await db.execute<{ id: string }>(
    sql`SELECT id FROM public.tcg_cards WHERE id IS NOT NULL ORDER BY id`,
  );

  const rows = result.rows ?? [];
  const urls = rows.map((r) => cardUrl(r.id));

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (loc) => `  <url>
    <loc>${xmlEscape(loc)}</loc>
    <lastmod>${now}</lastmod>
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
