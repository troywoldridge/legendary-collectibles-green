import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export type CollectiblesSortKey = "relevance" | "release_year" | "name" | "franchise" | "series";
export type CollectiblesSortOrder = "asc" | "desc";

export type QueryCollectiblesArgs = {
  q?: string;
  franchise?: string;
  series?: string;
  yearMin?: number;
  yearMax?: number;
  sort?: CollectiblesSortKey;
  order?: CollectiblesSortOrder;
  page?: number;
  pageSize?: number;
};

type Row = {
  id: string;
  name: string | null;
  franchise: string | null;
  series: string | null;
  line: string | null;
  number: string | null;
  edition: string | null;
  variant: string | null;
  image_small: string | null;
  image_large: string | null;
  upc: string | null;
  release_year: number | null;
  exclusivity: string | null;
  is_chase: boolean | null;
  is_exclusive: boolean | null;
  description: string | null;
  source: string | null;
  source_id: string | null;
  extra: any;
};

function s(v: unknown) {
  return String(v ?? "").trim();
}

function ilikeEscape(v: string) {
  return v.replace(/[%_\\]/g, (m) => `\\${m}`);
}

export async function queryCollectiblesItems(args: QueryCollectiblesArgs) {
  const q = s(args.q);
  const franchise = s(args.franchise);
  const series = s(args.series);

  const yearMin = typeof args.yearMin === "number" ? args.yearMin : undefined;
  const yearMax = typeof args.yearMax === "number" ? args.yearMax : undefined;

  const sort: CollectiblesSortKey = (args.sort ?? "relevance") as CollectiblesSortKey;
  const order: CollectiblesSortOrder = (args.order ?? "desc") as CollectiblesSortOrder;

  const page = Math.max(1, Number.isFinite(args.page as number) ? (args.page as number) : 1);
  const pageSizeRaw = Number.isFinite(args.pageSize as number) ? (args.pageSize as number) : 48;
  const pageSize = [24, 48, 72, 96].includes(pageSizeRaw) ? pageSizeRaw : 48;
  const offset = (page - 1) * pageSize;

  const where: any[] = [];
  where.push(sql`1=1`);

  if (franchise) where.push(sql`ci.franchise ILIKE ${franchise}`);
  if (series) where.push(sql`ci.series ILIKE ${series}`);

  if (yearMin != null) where.push(sql`ci.release_year >= ${yearMin}`);
  if (yearMax != null) where.push(sql`ci.release_year <= ${yearMax}`);

  if (q) {
    const like = `%${ilikeEscape(q)}%`;
    where.push(sql`(
      ci.id ILIKE ${like}
      OR coalesce(ci.name,'') ILIKE ${like}
      OR coalesce(ci.franchise,'') ILIKE ${like}
      OR coalesce(ci.series,'') ILIKE ${like}
      OR coalesce(ci.line,'') ILIKE ${like}
      OR coalesce(ci.number,'') ILIKE ${like}
      OR coalesce(ci.upc,'') ILIKE ${like}
      OR coalesce(ci.description,'') ILIKE ${like}
    )`);
  }

  const whereSql = sql`where ${sql.join(where, sql` and `)}`;

  // Simple relevance: name match first, then franchise/series, then updated_at
  const orderDir = order === "asc" ? sql`asc` : sql`desc`;

  let orderBy = sql`ci.updated_at desc nulls last, ci.id asc`;

  if (sort === "release_year") {
    orderBy = sql`ci.release_year ${orderDir} nulls last, ci.name asc nulls last, ci.id asc`;
  } else if (sort === "name") {
    orderBy = sql`ci.name ${orderDir} nulls last, ci.id asc`;
  } else if (sort === "franchise") {
    orderBy = sql`ci.franchise ${orderDir} nulls last, ci.series asc nulls last, ci.name asc nulls last, ci.id asc`;
  } else if (sort === "series") {
    orderBy = sql`ci.series ${orderDir} nulls last, ci.name asc nulls last, ci.id asc`;
  } else if (sort === "relevance" && q) {
    const q2 = q.toLowerCase();
    orderBy = sql`
      (case when lower(coalesce(ci.name,'')) like ${"%" + ilikeEscape(q2) + "%"} then 0 else 1 end) asc,
      (case when lower(coalesce(ci.franchise,'')) like ${"%" + ilikeEscape(q2) + "%"} then 0 else 1 end) asc,
      (case when lower(coalesce(ci.series,'')) like ${"%" + ilikeEscape(q2) + "%"} then 0 else 1 end) asc,
      ci.updated_at desc nulls last,
      ci.id asc
    `;
  }

  // count
  const countRes = await db.execute<{ count: string }>(sql`
    select count(*)::text as count
    from collectibles_items ci
    ${whereSql}
  `);
  const total = Number(countRes.rows?.[0]?.count ?? "0");
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // rows (+ one image)
  const res = await db.execute<Row>(sql`
    select
      ci.id::text as id,
      ci.name,
      ci.franchise,
      ci.series,
      ci.line,
      ci.number,
      ci.edition,
      ci.variant,
      ci.image_small,
      ci.image_large,
      ci.upc,
      ci.release_year,
      ci.exclusivity,
      ci.is_chase,
      ci.is_exclusive,
      ci.description,
      ci.source,
      ci.source_id,
      ci.extra
    from collectibles_items ci
    ${whereSql}
    order by ${orderBy}
    limit ${pageSize}
    offset ${offset}
  `);

  const items = (res.rows ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    franchise: r.franchise,
    series: r.series,
    line: r.line,
    number: r.number,
    edition: r.edition,
    variant: r.variant,
    image_small: r.image_small,
    image_large: r.image_large,
    upc: r.upc,
    release_year: r.release_year,
    exclusivity: r.exclusivity,
    is_chase: r.is_chase,
    is_exclusive: r.is_exclusive,
    description: r.description,
    source: r.source,
    source_id: r.source_id,
    extra: r.extra,
  }));

  return {
    ok: true as const,
    items,
    page,
    pageSize,
    total,
    totalPages,
    sort,
    order,
    applied: {
      q: q || "",
      franchise: franchise || "",
      series: series || "",
      yearMin: yearMin ?? null,
      yearMax: yearMax ?? null,
    },
  };
}
