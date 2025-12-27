import type { MetadataRoute } from "next";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

type SitemapEntry = MetadataRoute.Sitemap[number];
type ChangeFreq = NonNullable<SitemapEntry["changeFrequency"]>;

const BASE =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
  "https://legendary-collectibles.com";

function u(path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${BASE}${p === "/" ? "" : p}`;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Helper to force literal types (prevents TS widening to string)
  const E = (e: {
    url: string;
    lastModified?: Date;
    changeFrequency?: ChangeFreq;
    priority?: number;
  }): SitemapEntry => ({
    url: e.url,
    lastModified: e.lastModified ?? now,
    changeFrequency: e.changeFrequency,
    priority: e.priority,
  });

  // ---------- Static public pages ----------
  const staticPages: SitemapEntry[] = [
    E({ url: u(""), changeFrequency: "weekly", priority: 1.0 }),

    // main nav / category hubs
    E({ url: u("/categories/pokemon"), changeFrequency: "daily", priority: 0.9 }),
    E({ url: u("/categories/mtg"), changeFrequency: "daily", priority: 0.9 }),
    E({ url: u("/categories/yugioh"), changeFrequency: "daily", priority: 0.9 }),
    E({ url: u("/shop"), changeFrequency: "daily", priority: 0.9 }),

    // informational
    E({ url: u("/about"), changeFrequency: "monthly", priority: 0.5 }),
    E({ url: u("/legal"), changeFrequency: "monthly", priority: 0.4 }),
  ];

  // ---------- Pokémon card pages (tcg_cards ids are text like "dp2-19") ----------
  const pokemonIds =
    (
      await db.execute<{ id: string }>(sql`
        SELECT id
        FROM public.tcg_cards
        WHERE id IS NOT NULL
        ORDER BY id
      `)
    ).rows ?? [];

  const pokemonUrls: SitemapEntry[] = pokemonIds.flatMap((c) => {
    const id = encodeURIComponent(c.id);
    return [
      E({
        url: u(`/categories/pokemon/cards/${id}`),
        changeFrequency: "monthly",
        priority: 0.7,
      }),
      E({
        url: u(`/categories/pokemon/cards/${id}/prices`),
        changeFrequency: "weekly",
        priority: 0.6,
      }),
    ];
  });

  // ---------- MTG card pages (uuid) ----------
  const mtgIds =
    (
      await db.execute<{ id: string }>(sql`
        SELECT DISTINCT scryfall_id::text AS id
        FROM public.mtg_prices_scryfall_latest
        WHERE scryfall_id IS NOT NULL
      `)
    ).rows ?? [];

  const mtgUrls: SitemapEntry[] = mtgIds.flatMap((c) => {
    const id = encodeURIComponent(c.id);
    return [
      E({
        url: u(`/categories/mtg/cards/${id}`),
        changeFrequency: "monthly",
        priority: 0.7,
      }),
      E({
        url: u(`/categories/mtg/cards/${id}/prices`),
        changeFrequency: "weekly",
        priority: 0.6,
      }),
    ];
  });

  // ---------- Yu-Gi-Oh card pages (ygo_cards.card_id is text/number-like) ----------
  const ygoIds =
    (
      await db.execute<{ id: string }>(sql`
        SELECT card_id::text AS id
        FROM public.ygo_cards
        WHERE card_id IS NOT NULL
        ORDER BY card_id
      `)
    ).rows ?? [];

  const ygoUrls: SitemapEntry[] = ygoIds.flatMap((c) => {
    const id = encodeURIComponent(c.id);
    return [
      E({
        url: u(`/categories/yugioh/cards/${id}`),
        changeFrequency: "monthly",
        priority: 0.7,
      }),
      // if you have a prices page for YGO, keep this; if not, remove it
      E({
        url: u(`/categories/yugioh/cards/${id}/prices`),
        changeFrequency: "weekly",
        priority: 0.6,
      }),
    ];
  });

  // NOTE: Do NOT include /my-collection or any user-specific routes in sitemap.
  // Google will crawl it and it’s auth-gated + not useful for SEO.

  return [...staticPages, ...pokemonUrls, ...mtgUrls, ...ygoUrls];
}
