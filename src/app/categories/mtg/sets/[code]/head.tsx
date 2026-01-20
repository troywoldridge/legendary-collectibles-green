// src/app/categories/mtg/sets/[id]/head.tsx
import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { site } from "@/config/site";

type SearchParams = Record<string, string | string[] | undefined>;

function firstVal(v?: string | string[]) {
  return Array.isArray(v) ? v[0] : v;
}
function parsePerPage(v?: string | string[]) {
  const n = Number(firstVal(v) ?? 60);
  return Number.isFinite(n) && n > 0 ? n : 60;
}
function parsePage(v?: string | string[]) {
  const n = Number(firstVal(v) ?? 1);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}
function buildQuery(qs: { page?: number; perPage?: number }) {
  const p = new URLSearchParams();
  if (qs.perPage) p.set("perPage", String(qs.perPage));
  if (qs.page && qs.page > 1) p.set("page", String(qs.page));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export default async function Head({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const p = await params;
  const sp = await searchParams;

  const code = decodeURIComponent(String(p.id ?? "")).trim();
  const perPage = parsePerPage(sp?.perPage);
  const page = Math.max(1, parsePage(sp?.page));

  // If the set doesn't exist, don't emit prev/next.
  const setRes = await db.execute<{ code: string }>(sql`
    SELECT code
    FROM public.scryfall_sets
    WHERE LOWER(code) = LOWER(${code})
    LIMIT 1
  `);
  const s = setRes.rows?.[0] ?? null;
  if (!s) return null;

  const totalRes = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*)::text AS count
    FROM public.scryfall_cards_raw c
    WHERE LOWER(c.set_code) = LOWER(${s.code})
  `);
  const total = Number(totalRes.rows?.[0]?.count ?? "0");
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const basePath = `/categories/mtg/sets/${encodeURIComponent(s.code)}`;

  const prevHref =
    page > 1
      ? `${site.url}${basePath}${buildQuery({ page: page - 1, perPage })}`
      : null;

  const nextHref =
    page < totalPages
      ? `${site.url}${basePath}${buildQuery({ page: page + 1, perPage })}`
      : null;

  return (
    <>
      {prevHref ? <link rel="prev" href={prevHref} /> : null}
      {nextHref ? <link rel="next" href={nextHref} /> : null}
    </>
  );
}
