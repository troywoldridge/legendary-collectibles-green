// src/app/categories/yugioh/sets/[id]/head.tsx
import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { site } from "@/config/site";

function toInt(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}
function getStr(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0] ?? null;
  return null;
}
function qs(next: Record<string, string | number | undefined | null>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) {
    if (v === undefined || v === null || v === "") continue;
    if (k === "page" && String(v) === "1") continue;
    params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export default async function Head({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, unknown>>;
}) {
  const p = await params;
  const sp = await searchParams;

  const setName = decodeURIComponent(p.id ?? "").trim();
  const qRaw = getStr(sp.q);
  const q = qRaw ? qRaw.trim() : null;

  const per = Math.min(96, toInt(sp.per, 36));
  const page = Math.max(1, toInt(sp.page, 1));
  const offset = (page - 1) * per;

  const filters = [sql`cs.set_name = ${setName}`];
  if (q) {
    filters.push(sql`(c.card_id = ${q} OR c.name ILIKE '%' || ${q} || '%')`);
  }
  const where = sql.join(filters, sql` AND `);

  const countRes = await db.execute<{ count: string }>(sql`
    SELECT COUNT(DISTINCT cs.card_id)::bigint::text AS count
    FROM ygo_card_sets cs
    JOIN ygo_cards c ON c.card_id = cs.card_id
    WHERE ${where}
  `);

  const total = Number(countRes.rows?.[0]?.count ?? "0");
  const pages = Math.max(1, Math.ceil(total / per));

  const basePath = `/categories/yugioh/sets/${encodeURIComponent(setName)}`;

  const prevHref =
    page > 1
      ? `${site.url}${basePath}${qs({ q, per, page: page - 1 })}`
      : null;

  const nextHref =
    page < pages
      ? `${site.url}${basePath}${qs({ q, per, page: page + 1 })}`
      : null;

  return (
    <>
      {prevHref ? <link rel="prev" href={prevHref} /> : null}
      {nextHref ? <link rel="next" href={nextHref} /> : null}
    </>
  );
}
