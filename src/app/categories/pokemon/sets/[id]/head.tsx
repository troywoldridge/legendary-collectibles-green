// src/app/categories/pokemon/sets/[id]/head.tsx
import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { site } from "@/config/site";

type SearchParams = Record<string, string | string[] | undefined>;

function first(v?: string | string[]) {
  return Array.isArray(v) ? v[0] : v;
}
function parsePage(v?: string | string[]) {
  const n = Number(first(v) ?? 1);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}
function parsePerPage(v?: string | string[]) {
  const n = Number(first(v) ?? 30);
  return Number.isFinite(n) && n > 0 ? n : 30;
}
function parseBool(v?: string | string[]) {
  const s = (first(v) ?? "").toLowerCase();
  return s === "1" || s === "true" || s === "on" || s === "yes";
}
function buildQuery(qs: { q?: string | null; page?: number; perPage?: number; rares?: boolean; holo?: boolean }) {
  const p = new URLSearchParams();
  if (qs.q) p.set("q", qs.q);
  if (qs.page && qs.page > 1) p.set("page", String(qs.page));
  if (qs.perPage) p.set("perPage", String(qs.perPage));
  if (qs.rares) p.set("rares", "1");
  if (qs.holo) p.set("holo", "1");
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

  const setId = decodeURIComponent(p.id ?? "").trim();
  const q = (first(sp?.q) ?? "").trim() || null;
  const perPage = parsePerPage(sp?.perPage);
  const page = Math.max(1, parsePage(sp?.page));
  const raresOnly = parseBool(sp?.rares);
  const holoOnly = parseBool(sp?.holo);

  // Total count for pagination
  const filters = [sql`c.set_id = ${setId}`];

  if (q) {
    filters.push(sql`(
      c.name ILIKE ${"%" + q + "%"}
      OR c.rarity ILIKE ${"%" + q + "%"}
      OR c.id ILIKE ${"%" + q + "%"}
      OR c.number ILIKE ${"%" + q + "%"}
    )`);
  }

  if (raresOnly && holoOnly) {
    filters.push(sql`(c.rarity ILIKE '%Rare%' AND (c.rarity ILIKE '%Holo%' OR c.rarity ILIKE '%Foil%'))`);
  } else if (raresOnly) {
    filters.push(sql`(c.rarity ILIKE '%Rare%')`);
  } else if (holoOnly) {
    filters.push(sql`(c.rarity ILIKE '%Holo%' OR c.rarity ILIKE '%Foil%')`);
  }

  const where = sql.join(filters, sql` AND `);

  const total =
    (await db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count
      FROM public.tcg_cards c
      WHERE ${where}
    `)).rows?.[0]?.count ?? 0;

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const basePath = `/categories/pokemon/sets/${encodeURIComponent(setId)}`;
  const prevHref =
    page > 1
      ? `${site.url}${basePath}${buildQuery({ q, page: page - 1, perPage, rares: raresOnly, holo: holoOnly })}`
      : null;

  const nextHref =
    page < totalPages
      ? `${site.url}${basePath}${buildQuery({ q, page: page + 1, perPage, rares: raresOnly, holo: holoOnly })}`
      : null;

  return (
    <>
      {prevHref ? <link rel="prev" href={prevHref} /> : null}
      {nextHref ? <link rel="next" href={nextHref} /> : null}
    </>
  );
}
