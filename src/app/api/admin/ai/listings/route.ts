import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toInt(v: string | null, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const q = (searchParams.get("q") || "").trim();
  const status = (searchParams.get("status") || "").trim(); // optional product_status text
  const limit = Math.min(100, Math.max(1, toInt(searchParams.get("limit"), 25)));
  const offset = Math.max(0, toInt(searchParams.get("offset"), 0));

  // Note: product.status is enum product_status, but we cast to text for filtering.
  const rowsRes = await db.execute(sql`
    with base as (
      select
        p.id,
        p.title,
        p.slug,
        p.sku,
        p.game::text as game,
        p.format::text as format,
        p.sealed,
        p.is_graded as "isGraded",
        p.grader::text as grader,
        p.grade_x10 as "gradeX10",
        p.condition::text as condition,
        p.price_cents as "priceCents",
        p.quantity,
        p.status::text as status,
        p.updated_at as "updatedAt",
        (select count(*) from product_images i where i.product_id = p.id) as "imageCount"
      from products p
      where
        (${q} = '' OR
          p.title ilike ('%' || ${q} || '%') OR
          p.slug ilike ('%' || ${q} || '%') OR
          coalesce(p.sku,'') ilike ('%' || ${q} || '%')
        )
        AND (${status} = '' OR p.status::text = ${status})
      order by p.updated_at desc
      limit ${limit}
      offset ${offset}
    )
    select * from base;
  `);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (rowsRes as any)?.rows ?? [];
  return NextResponse.json({ ok: true, rows, limit, offset });
}
