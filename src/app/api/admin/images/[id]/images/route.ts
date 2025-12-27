import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { db } from "@/lib/db";
import { inventoryItemImages } from "@/lib/db/schema/inventory";
import { eq, sql } from "drizzle-orm";

export const runtime = "nodejs";

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
  if (!imageId) return NextResponse.json({ error: "imageId required" }, { status: 400 });

  const url = deliveryUrl(imageId);

  // sortOrder: push to end by default
  const sortOrder =
    Number.isInteger(body?.sortOrder) ? Number(body.sortOrder) : null;

  const [row] = await db
    .insert(inventoryItemImages)
    .values({
      itemId,
      url,
      sortOrder: sortOrder ?? 9999,
      // if your schema has imageId column, store it too:
      // imageId,
    } as any)
    .returning();

  return NextResponse.json({ ok: true, image: row, url });
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

  await db
    .delete(inventoryItemImages)
    .where(
      sql`${inventoryItemImages.id} = ${imageRowId} AND ${inventoryItemImages.itemId} = ${itemId}`
    );

  return NextResponse.json({ ok: true });
}
