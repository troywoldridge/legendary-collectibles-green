import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { id } = await context.params;

  const body = await req.json().catch(() => ({} as any));
  const urls: string[] = Array.isArray(body?.urls) ? body.urls : [];

  const clean = urls.map((u) => String(u || "").trim()).filter(Boolean);
  if (!clean.length) {
    return NextResponse.json({ error: "urls must be a non-empty array" }, { status: 400 });
  }

  // figure out next sort_order
  const maxRes = await db.execute(sql`
    SELECT COALESCE(MAX(sort_order), -1) AS max_sort
    FROM inventory_item_images
    WHERE item_id = ${id}
  `);
  const maxSort = Number((maxRes as any).rows?.[0]?.max_sort ?? -1);
  let sort = Number.isFinite(maxSort) ? maxSort + 1 : 0;

  // insert all
  for (const url of clean) {
    await db.execute(sql`
      INSERT INTO inventory_item_images (item_id, url, sort_order)
      VALUES (${id}, ${url}, ${sort})
    `);
    sort += 1;
  }

  return NextResponse.json({ ok: true, added: clean.length });
}
