import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ batchId: string }> }
) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { batchId } = await context.params;

  const batchRes = await db.execute(sql`
    SELECT id, filename, created_at, updated_at
    FROM inventory_import_batches
    WHERE id = ${batchId}
    LIMIT 1
  `);

  const batch = (batchRes as any).rows?.[0] ?? null;
  if (!batch) {
    return NextResponse.json({ error: "Batch not found", batchId }, { status: 404 });
  }

  const rowsRes = await db.execute(sql`
    SELECT
      id,
      batch_id,
      status,
      error,
      game,
      sku,
      title,
      condition,
      qty_delta,
      price_cents,
      cost_basis_cents,
      notes,
      image_urls,
      raw,
      linked_item_id,
      created_at,
      updated_at
    FROM inventory_import_rows
    WHERE batch_id = ${batchId}
    ORDER BY created_at ASC
    LIMIT 500
  `);

  const rows = (rowsRes as any).rows ?? [];

  return NextResponse.json({ batch, rows });
}
