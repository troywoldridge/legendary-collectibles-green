import "server-only";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
  "https://legendary-collectibles.com";

const CHUNK_SIZE = 21000;
const INDEX = 5;

function url(path: string) {
  return `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
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
  const offset = (INDEX - 1) * CHUNK_SIZE;

  const rows =
    (
      await db.execute<{ id: string }>(sql`
        SELECT DISTINCT scryfall_id::text AS id
        FROM public.mtg_prices_scryfall_latest
        WHERE scryfall_id IS NOT NULL
        ORDER BY scryfall_id::text
        LIMIT ${CHUNK_SIZE}
        OFFSET ${offset}
      `)
    ).rows ?? [];

  const urls: string[] = [];

  for (const r of rows) {
    const id = encodeURIComponent(r.id);
    urls.push(url(`/categories/mtg/cards/${id}`));
    urls.push(url(`/categories/mtg/cards/${id}/prices`));
  }

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
    urls
      .map(
        (u) =>
          `<url>` +
          `<loc>${xmlEscape(u)}</loc>` +
          `<lastmod>${now}</lastmod>` +
          `<changefreq>weekly</changefreq>` +
          `<priority>0.6</priority>` +
          `</url>`
      )
      .join("") +
    `</urlset>`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
