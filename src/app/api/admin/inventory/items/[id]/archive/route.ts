import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { db } from "@/lib/db";
import { inventoryItems } from "@/lib/db/schema/inventory";
import { eq, sql } from "drizzle-orm";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { id } = await context.params;

  const updated = await db
    .update(inventoryItems)
    .set({ status: "archived", updatedAt: sql`now()` })
    .where(eq(inventoryItems.id, id))
    .returning();

  const item = updated[0];
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ item });
}
