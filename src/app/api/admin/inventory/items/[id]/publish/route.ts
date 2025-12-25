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

  const res = await db.execute(sql`
    UPDATE inventory_items
    SET status = 'live', updated_at = now()
    WHERE id = ${id}
    RETURNING id, status
  `);

  const row = (res as any).rows?.[0] ?? null;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true, item: row });
}
