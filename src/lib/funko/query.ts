// src/lib/funko/query.ts
import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/* -------------------------------- Types -------------------------------- */

export type FunkoSortKey = "relevance" | "release_year" | "name" | "price" | "franchise" | "series";
export type FunkoSortOrder = "asc" | "desc";

export type FunkoListRow = {
  id: string;
  name: string | null;
  franchise: string | null;
  series: string | null;
  line: string | null;
  number: string | null;
  edition: string | null;
  variant: string | null;

  is_chase: boolean;
  is_exclusive: boolean;
  exclusivity: string | null;
  release_year: number | null;
  upc: string | null;

  image_small: string | null;
  image_large: string | null;

  // ✅ best image for listings: label='main' first, then sort_order, then created_at
  image_url: string | null;

  extra: any;

  // optional derived values from extra
  est_price_cents: number | null;
  sale_percent: number | null;
  rarity: string | null;

  // only populated when q is present
  relevance?: number | null;
};

export type QueryFunkoItemsArgs = {
  q?: string;
  franchise?: string;
  series?: string;
  rarity?: string;
  chase?: boolean | null;
  exclusive?: boolean | null;
  yearMin?: number;
  yearMax?: number;
  priceMin?: number;
  priceMax?: number;
  sort?: FunkoSortKey;
  order?: FunkoSortOrder;
  page?: number;
  pageSize?: number;
};

export type QueryFunkoItemsResult = {
  items: FunkoListRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  sort: FunkoSortKey;
  order: FunkoSortOrder;
  applied: Record<string, unknown>;
};

/* ------------------------------ Utilities ------------------------------- */

function s(v: unknown): string {
  return String(v ?? "").trim();
}

function toInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normalizeSort(v: unknown, hasQuery: boolean): FunkoSortKey {
  const k = s(v);
  const allowed: FunkoSortKey[] = ["relevance", "release_year", "name", "price", "franchise", "series"];
  const picked = allowed.includes(k as FunkoSortKey) ? (k as FunkoSortKey) : (hasQuery ? "relevance" : "release_year");
  // ✅ if user selects relevance but has no q, force a stable sort
  if (picked === "relevance" && !hasQuery) return "release_year";
  return picked;
}

function normalizeOrder(v: unknown): FunkoSortOrder {
  return s(v).toLowerCase() === "asc" ? "asc" : "desc";
}

function normalizePageSize(v: unknown): number {
  const n = toInt(v) ?? 48;
  return [24, 48, 72, 96].includes(n) ? n : 48;
}

function buildOrderBy(sort: FunkoSortKey, order: FunkoSortOrder) {
  const dir = order === "asc" ? sql`ASC` : sql`DESC`;

  // NOTE: We refer to columns by name (NOT ordinal positions) to avoid ORDER BY 0 errors.
  switch (sort) {
    case "relevance":
      return sql`base.relevance ${dir} NULLS LAST, base.release_year DESC NULLS LAST, base.name ASC NULLS LAST`;
    case "price":
      return sql`base.est_price_cents ${dir} NULLS LAST, base.release_year DESC NULLS LAST, base.name ASC NULLS LAST`;
    case "release_year":
      return sql`base.release_year ${dir} NULLS LAST, base.name ASC NULLS LAST`;
    case "name":
      return sql`base.name ${dir} NULLS LAST, base.release_year DESC NULLS LAST`;
    case "franchise":
      return sql`base.franchise ${dir} NULLS LAST, base.series ASC NULLS LAST, base.name ASC NULLS LAST`;
    case "series":
      return sql`base.series ${dir} NULLS LAST, base.franchise ASC NULLS LAST, base.name ASC NULLS LAST`;
    default:
      return sql`base.release_year DESC NULLS LAST, base.name ASC NULLS LAST`;
  }
}

/* ------------------------------ Main query ------------------------------ */

export async function queryFunkoItems(args: QueryFunkoItemsArgs): Promise<QueryFunkoItemsResult> {
  const q = s(args.q);
  const franchise = s(args.franchise);
  const series = s(args.series);
  const rarity = s(args.rarity);

  const chase = typeof args.chase === "boolean" ? args.chase : null;
  const exclusive = typeof args.exclusive === "boolean" ? args.exclusive : null;

  const yearMin = toInt(args.yearMin);
  const yearMax = toInt(args.yearMax);
  const priceMin = toInt(args.priceMin);
  const priceMax = toInt(args.priceMax);

  const page = clamp(toInt(args.page) ?? 1, 1, 1_000_000);
  const pageSize = normalizePageSize(args.pageSize);
  const offset = (page - 1) * pageSize;

  const sort = normalizeSort(args.sort, !!q);
  const order = normalizeOrder(args.order);

  const whereParts: any[] = [sql`1=1`];

  if (q) {
    const like = `%${q}%`;
    whereParts.push(sql`(
      fi.name ILIKE ${like}
      OR fi.franchise ILIKE ${like}
      OR fi.series ILIKE ${like}
      OR fi.line ILIKE ${like}
      OR fi.number ILIKE ${like}
      OR fi.upc ILIKE ${like}
    )`);
  }

  if (franchise) whereParts.push(sql`fi.franchise ILIKE ${`%${franchise}%`}`);
  if (series) whereParts.push(sql`fi.series ILIKE ${`%${series}%`}`);

  if (rarity) whereParts.push(sql`NULLIF(LOWER(fi.extra->>'rarity'), '') = ${rarity.toLowerCase()}`);

  if (chase === true) whereParts.push(sql`fi.is_chase = true`);
  if (chase === false) whereParts.push(sql`fi.is_chase = false`);

  if (exclusive === true) {
    whereParts.push(sql`(fi.is_exclusive = true OR COALESCE(NULLIF(fi.exclusivity, ''), '') <> '')`);
  }
  if (exclusive === false) {
    whereParts.push(sql`(fi.is_exclusive = false AND COALESCE(NULLIF(fi.exclusivity, ''), '') = '')`);
  }

  if (yearMin != null) whereParts.push(sql`fi.release_year >= ${yearMin}`);
  if (yearMax != null) whereParts.push(sql`fi.release_year <= ${yearMax}`);

  const whereSql = sql.join(whereParts, sql` AND `);

  const outerWhereParts: any[] = [sql`1=1`];
  if (priceMin != null) outerWhereParts.push(sql`COALESCE(base.est_price_cents, -1) >= ${priceMin}`);
  if (priceMax != null) outerWhereParts.push(sql`COALESCE(base.est_price_cents, -1) <= ${priceMax}`);
  const outerWhereSql = sql.join(outerWhereParts, sql` AND `);

  const orderBy = buildOrderBy(sort, order);

  const totalRes = await db.execute<{ total: number }>(sql`
    WITH base AS (
      SELECT
        fi.id::text AS id,
        CASE
          WHEN (fi.extra->>'estimated_price_cents') ~ '^[0-9]+$'
            THEN (fi.extra->>'estimated_price_cents')::int
          ELSE NULL
        END AS est_price_cents
      FROM public.funko_items fi
      WHERE ${whereSql}
    )
    SELECT COUNT(*)::int AS total
    FROM base
    WHERE ${outerWhereSql};
  `);

  const total = Number(totalRes.rows?.[0]?.total ?? 0) || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const rowsRes = await db.execute<FunkoListRow>(sql`
    WITH base AS (
      SELECT
        fi.id::text as id,
        fi.name,
        fi.franchise,
        fi.series,
        fi.line,
        fi.number,
        fi.edition,
        fi.variant,
        fi.is_chase,
        fi.is_exclusive,
        fi.exclusivity,
        fi.release_year,
        fi.upc,
        fi.image_small,
        fi.image_large,
        fi.extra,

        -- ✅ "main" first, then sort_order
        COALESCE(
          (
            SELECT fii.url
            FROM public.funko_item_images fii
            WHERE fii.item_id = fi.id
            ORDER BY
              (CASE WHEN fii.label = 'main' THEN 0 ELSE 1 END) ASC,
              fii.sort_order ASC,
              fii.created_at ASC
            LIMIT 1
          ),
          fi.image_large,
          fi.image_small
        ) as image_url,

        CASE
          WHEN (fi.extra->>'estimated_price_cents') ~ '^[0-9]+$'
            THEN (fi.extra->>'estimated_price_cents')::int
          ELSE NULL
        END as est_price_cents,

        CASE
          WHEN (fi.extra->>'sale_percent') ~ '^[0-9]+$'
            THEN (fi.extra->>'sale_percent')::int
          ELSE NULL
        END as sale_percent,

        NULLIF(LOWER(fi.extra->>'rarity'), '') as rarity,

        CASE
          WHEN ${q} <> '' THEN
            ts_rank_cd(
              to_tsvector('english',
                COALESCE(fi.name,'') || ' ' ||
                COALESCE(fi.franchise,'') || ' ' ||
                COALESCE(fi.series,'') || ' ' ||
                COALESCE(fi.line,'') || ' ' ||
                COALESCE(fi.number::text,'') || ' ' ||
                COALESCE(fi.upc,'')
              ),
              websearch_to_tsquery('english', ${q})
            )
          ELSE NULL
        END as relevance
      FROM public.funko_items fi
      WHERE ${whereSql}
    )
    SELECT *
    FROM base
    WHERE ${outerWhereSql}
    ORDER BY ${orderBy}
    LIMIT ${pageSize}
    OFFSET ${offset};
  `);

  const items = (rowsRes.rows ?? []).map((r: any) => ({
    ...r,
    est_price_cents: r.est_price_cents == null ? null : Number(r.est_price_cents),
    sale_percent: r.sale_percent == null ? null : Number(r.sale_percent),
    relevance: r.relevance == null ? null : Number(r.relevance),
  }));

  return {
    items,
    page,
    pageSize,
    total,
    totalPages,
    sort,
    order,
    applied: {
      q,
      franchise: franchise || null,
      series: series || null,
      rarity: rarity || null,
      chase,
      exclusive,
      yearMin,
      yearMax,
      priceMin,
      priceMax,
      sort,
      order,
      page,
      pageSize,
    },
  };
}

/* ----------------------------- Related query ---------------------------- */

export type QueryRelatedFunkoArgs = {
  itemId: string;
  franchise?: string | null;
  series?: string | null;
  limit?: number;
};

export async function queryRelatedFunko(args: QueryRelatedFunkoArgs): Promise<FunkoListRow[]> {
  const itemId = s(args.itemId);
  if (!itemId) return [];

  const franchise = s(args.franchise);
  const series = s(args.series);
  const limit = clamp(toInt(args.limit) ?? 48, 1, 250);

  const whereParts: any[] = [sql`fi.id <> ${itemId}`];

  // Prefer same franchise > same series > fallback to newest
  if (franchise) whereParts.push(sql`fi.franchise = ${franchise}`);
  else if (series) whereParts.push(sql`fi.series = ${series}`);

  const whereSql = sql.join(whereParts, sql` AND `);

  const res = await db.execute<FunkoListRow>(sql`
    SELECT
      fi.id::text as id,
      fi.name,
      fi.franchise,
      fi.series,
      fi.line,
      fi.number,
      fi.edition,
      fi.variant,
      fi.is_chase,
      fi.is_exclusive,
      fi.exclusivity,
      fi.release_year,
      fi.upc,
      fi.image_small,
      fi.image_large,
      fi.extra,

      COALESCE(
        (
          SELECT fii.url
          FROM public.funko_item_images fii
          WHERE fii.item_id = fi.id
          ORDER BY
            (CASE WHEN fii.label = 'main' THEN 0 ELSE 1 END) ASC,
            fii.sort_order ASC,
            fii.created_at ASC
          LIMIT 1
        ),
        fi.image_large,
        fi.image_small
      ) as image_url,

      CASE
        WHEN (fi.extra->>'estimated_price_cents') ~ '^[0-9]+$'
          THEN (fi.extra->>'estimated_price_cents')::int
        ELSE NULL
      END as est_price_cents,

      CASE
        WHEN (fi.extra->>'sale_percent') ~ '^[0-9]+$'
          THEN (fi.extra->>'sale_percent')::int
        ELSE NULL
      END as sale_percent,

      NULLIF(LOWER(fi.extra->>'rarity'), '') as rarity,

      NULL::float as relevance
    FROM public.funko_items fi
    WHERE ${whereSql}
    ORDER BY fi.release_year DESC NULLS LAST, fi.name ASC NULLS LAST
    LIMIT ${limit};
  `);

  return (res.rows ?? []).map((r: any) => ({
    ...r,
    est_price_cents: r.est_price_cents == null ? null : Number(r.est_price_cents),
    sale_percent: r.sale_percent == null ? null : Number(r.sale_percent),
  }));
}
