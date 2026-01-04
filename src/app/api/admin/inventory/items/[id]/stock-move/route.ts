// src/app/api/admin/inventory/items/[id]/stock-move/route.ts
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import {
  inventoryItems,
  inventoryStockMovements,
} from "@/lib/db/schema/inventory";
import { eq, sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  // Lazy imports to avoid build-time module evaluation blowing up "collect page data"
  const [{ requireAdmin }, { db }] = await Promise.all([
    import("@/lib/adminAuth"),
    import("@/lib/db"),
  ]);

  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { id } = await context.params;

  const body = await req.json().catch(() => ({} as any));
  const delta = Number(body?.delta);

  if (!Number.isInteger(delta) || delta === 0) {
    return NextResponse.json(
      { error: "delta must be a non-zero integer" },
      { status: 400 },
    );
  }

  const reason = (body?.reason || "MANUAL_ADJUST") as any;
  const note = (body?.note || null) as string | null;

  await db.transaction(async (tx: any) => {
    await tx.insert(inventoryStockMovements).values({
      itemId: id,
      delta,
      reason,
      note,
    } as any);

    await tx
      .update(inventoryItems)
      .set({
        onHand: sql`${inventoryItems.onHand} + ${delta}`,
        updatedAt: sql`now()`,
      })
      .where(eq(inventoryItems.id, id));
  });

  return NextResponse.json({ ok: true });
}
