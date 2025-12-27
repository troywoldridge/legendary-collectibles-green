import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { id: itemId } = await context.params;

  const res = await db.execute(sql`
    SELECT id, item_id, url, sort_order, created_at
    FROM inventory_item_images
    WHERE item_id = ${itemId}
    ORDER BY sort_order ASC, created_at ASC
    LIMIT 200
  `);

  const images = (res as any).rows ?? [];
  return NextResponse.json({ images });
}

// This endpoint is called by ImageDropzone after Cloudflare upload.
// It inserts a row using a delivery URL and appends to end.
// Supports either { imageId } or { url } if you ever want manual URLs.
function deliveryUrl(imageId: string) {
  const hash = process.env.CF_IMAGES_DELIVERY_HASH;
  const variant = process.env.CF_IMAGES_DEFAULT_VARIANT || "public";
  if (!hash) throw new Error("Missing CF_IMAGES_DELIVERY_HASH");
  return `https://imagedelivery.net/${hash}/${imageId}/${variant}`;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { id: itemId } = await context.params;
  const body = await req.json().catch(() => ({}));

  const imageId = String(body?.imageId || "").trim();
  const rawUrl = String(body?.url || "").trim();

  let url = rawUrl;
  if (!url && imageId) url = deliveryUrl(imageId);

  if (!url) {
    return NextResponse.json({ error: "Provide imageId or url" }, { status: 400 });
  }

  // append to end
  const maxRes = await db.execute(sql`
    SELECT COALESCE(MAX(sort_order), 0) AS max_sort
    FROM inventory_item_images
    WHERE item_id = ${itemId}
  `);
  const maxSort = Number((maxRes as any).rows?.[0]?.max_sort ?? 0);
  const nextSort = maxSort + 10;

  const ins = await db.execute(sql`
    INSERT INTO inventory_item_images (item_id, url, sort_order)
    VALUES (${itemId}, ${url}, ${nextSort})
    RETURNING id, item_id, url, sort_order, created_at
  `);

  const image = (ins as any).rows?.[0] ?? null;
  return NextResponse.json({ ok: true, image });
}

// Reorder: expects { orderedIds: string[] } in final order
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { id: itemId } = await context.params;
  const body = await req.json().catch(() => ({}));
  const orderedIds: string[] = Array.isArray(body?.orderedIds) ? body.orderedIds : [];

  if (!orderedIds.length) {
    return NextResponse.json({ error: "orderedIds[] required" }, { status: 400 });
  }

  // Write sort_order with spacing so inserts can be appended cleanly later.
  await db.transaction(async (tx: any) => {
    let sort = 10;
    for (const imageRowId of orderedIds) {
      await tx.execute(sql`
        UPDATE inventory_item_images
        SET sort_order = ${sort}
        WHERE id = ${imageRowId} AND item_id = ${itemId}
      `);
      sort += 10;
    }
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { id: itemId } = await context.params;
  const url = new URL(req.url);
  const imageRowId = url.searchParams.get("imageRowId");

  if (!imageRowId) {
    return NextResponse.json({ error: "imageRowId required" }, { status: 400 });
  }

  await db.execute(sql`
    DELETE FROM inventory_item_images
    WHERE id = ${imageRowId} AND item_id = ${itemId}
  `);

  return NextResponse.json({ ok: true });
}
