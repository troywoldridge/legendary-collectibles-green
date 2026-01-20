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
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

function toJsonArray(v: unknown): any[] {
  try {
    if (Array.isArray(v)) return v;
    if (typeof v === "string") {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    }
    if (v && typeof v === "object") return v as any[];
  } catch {
    // ignore
  }
  return [];
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
      p.subtitle,
      p.description,

      -- Make enums more JS-friendly for SEO code paths
      p.game::text AS game,
      p.format::text AS format,
      p.status::text AS status,
      p.inventory_type::text AS inventory_type,
      p.grader::text AS grader,
      p.condition::text AS condition,

      p.sealed,
      p.is_graded,
      p.grade_x10,

      p.price_cents,
      p.compare_at_cents,
      p.quantity,

      p.sku,
      p.card_kind,

      -- ✅ SEO / keyword enrichment fields
      p.source_card_id,
      p.source_set_code,
      p.source_number,
      p.source_set_name,

      -- optional commerce fields (handy later)
      p.shipping_weight_lbs,
      p.shipping_class,

      p.created_at,
      p.updated_at,

      -- ✅ Prefer product_images; fall back to source card images
      COALESCE(
        (
          SELECT pi.url
          FROM product_images pi
          WHERE pi.product_id = p.id
          ORDER BY pi.sort ASC, pi.created_at ASC
          LIMIT 1
        ),
        (
          SELECT tcg.small_image
          FROM tcg_cards tcg
          WHERE tcg.id = p.source_card_id
          LIMIT 1
        ),
        (
          SELECT yi.image_url
          FROM ygo_card_images yi
          WHERE yi.card_id = p.source_card_id
          LIMIT 1
        )
      ) AS image_url,

      -- ✅ Prefer product_images[]; if empty, build a 1-item array from fallback image
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
        (
          CASE
            WHEN COALESCE(
              (
                SELECT tcg.small_image
                FROM tcg_cards tcg
                WHERE tcg.id = p.source_card_id
                LIMIT 1
              ),
              (
                SELECT yi.image_url
                FROM ygo_card_images yi
                WHERE yi.card_id = p.source_card_id
                LIMIT 1
              )
            ) IS NOT NULL
            THEN json_build_array(
              json_build_object(
                'url',
                COALESCE(
                  (
                    SELECT tcg.small_image
                    FROM tcg_cards tcg
                    WHERE tcg.id = p.source_card_id
                    LIMIT 1
                  ),
                  (
                    SELECT yi.image_url
                    FROM ygo_card_images yi
                    WHERE yi.card_id = p.source_card_id
                    LIMIT 1
                  )
                ),
                'alt', p.title,
                'sort', 0
              )
            )
            ELSE '[]'::json
          END
        )
      ) AS images

    FROM products p
    WHERE ${byId ? sql`p.id = ${raw}::uuid` : sql`p.slug = ${raw}`}
    LIMIT 1
  `;

  try {
    const res = await db.execute(q);
    const rows = Array.isArray((res as any)?.rows)
      ? (res as any).rows
      : (res as any);
    const item = rows?.[0];

    if (!item) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const images = toJsonArray((item as any).images);

    return NextResponse.json({ item: { ...item, images } }, { status: 200 });
  } catch (e: any) {
    console.error("[api/products/[id]] error:", e?.message || e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
