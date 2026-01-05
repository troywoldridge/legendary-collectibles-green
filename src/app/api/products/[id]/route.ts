import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function norm(v: unknown): string {
  return String(v ?? "").trim();
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const p = await ctx.params;
  const raw = norm(p?.id);

  if (!raw) {
    return NextResponse.json(
      { error: "bad_request", message: "Missing product id." },
      { status: 400 },
    );
  }

  const byId = isUuid(raw);

  const q = sql`
    SELECT
      p.id,
      p.title,
      p.slug,
      p.game,
      p.format,
      p.sealed,
      p.is_graded,
      p.grader,
      p.grade_x10,
      p.condition,
      p.price_cents,
      p.compare_at_cents,
      p.inventory_type,
      p.quantity,
      p.status,
      p.subtitle,
      p.description,
      p.created_at,
      p.updated_at,

      (
        SELECT pi.url
        FROM product_images pi
        WHERE pi.product_id = p.id
        ORDER BY pi.sort ASC, pi.created_at ASC
        LIMIT 1
      ) AS image_url,

      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'url', pi.url,
              'alt', pi.alt,
              'sort', pi.sort
            )
            ORDER BY pi.sort ASC, pi.created_at ASC
          )
          FROM product_images pi
          WHERE pi.product_id = p.id
        ),
        '[]'::json
      ) AS images

    FROM products p
    WHERE ${byId ? sql`p.id = ${raw}::uuid` : sql`p.slug = ${raw}`}
    LIMIT 1
  `;

  try {
    const res = await db.execute(q);
    const rows = Array.isArray((res as any)?.rows) ? (res as any).rows : (res as any);
    const item = rows?.[0];

    if (!item) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    let images: any[] = [];
    try {
      if (Array.isArray(item.images)) images = item.images;
      else if (typeof item.images === "string") images = JSON.parse(item.images);
      else if (item.images) images = item.images;
    } catch {
      images = [];
    }

    return NextResponse.json({ item: { ...item, images } }, { status: 200 });
  } catch (e: any) {
    console.error("[api/products/[id]] error:", e?.message || e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
