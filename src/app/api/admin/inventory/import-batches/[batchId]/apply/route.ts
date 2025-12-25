import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { db } from "@/lib/db";
import {
  inventoryImportRows,
  inventoryItems,
  inventoryStockMovements,
} from "@/lib/db/schema/inventory";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

function genSku() {
  return (
    "INV-" +
    Math.random().toString(36).slice(2, 8).toUpperCase() +
    "-" +
    Date.now().toString(36).toUpperCase()
  );
}

type ItemLite = { id: string; sku: string | null; onHand: number };

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ batchId: string }> }
) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { batchId } = await context.params;

  const body = await req.json().catch(() => ({} as any));
  const onlyRowIds: string[] | null = Array.isArray(body?.rowIds)
    ? body.rowIds
    : null;

  const rows = await db
    .select()
    .from(inventoryImportRows)
    .where(
      and(
        eq(inventoryImportRows.batchId, batchId),
        eq(inventoryImportRows.status, "pending"),
        onlyRowIds ? inArray(inventoryImportRows.id, onlyRowIds) : sql`true`
      )
    )
    .orderBy(desc(inventoryImportRows.createdAt));

  if (!rows.length) {
    return NextResponse.json({
      ok: true,
      appliedCount: 0,
      failedCount: 0,
      applied: [],
      failed: [],
    });
  }

  const applied: { rowId: string; itemId?: string; sku?: string; title?: string }[] =
    [];
  const failed: { rowId: string; error: string }[] = [];

  await db.transaction(async (tx) => {
    for (const r of rows) {
      try {
        const title = (r.title || "").trim();
        const qtyDelta = r.qtyDelta ?? null;

        if (!title) throw new Error("Row missing title");
        if (qtyDelta === null || !Number.isInteger(qtyDelta)) {
          throw new Error("Row missing qtyDelta");
        }

        // Find existing item by SKU if present
        let item: ItemLite | null = null;

        if (r.sku) {
          const found = await tx
            .select({
              id: inventoryItems.id,
              sku: inventoryItems.sku,
              onHand: inventoryItems.onHand,
            })
            .from(inventoryItems)
            .where(eq(inventoryItems.sku, r.sku))
            .limit(1);

          item = found[0] ?? null;
        }

        // Create item if not found
        if (!item) {
          const sku = r.sku || genSku();

          const created = await tx
            .insert(inventoryItems)
            .values({
              game: (r.game as any) || "other",
              sku,
              title,
              condition: r.condition || "",
              status: "draft",
              priceCents: r.priceCents ?? 0,
              costBasisCents: r.costBasisCents ?? 0,
              meta: {},
            })
            .returning(); // <-- NO ARGS (compatible)

          const c0: any = created?.[0];
          if (!c0?.id) throw new Error("Failed to create item");

          item = {
            id: String(c0.id),
            sku: c0.sku ?? sku,
            onHand: Number(c0.onHand ?? 0),
          };
        } else {
          // Conservative updates if provided
          const updates: any = { updatedAt: sql`now()` };
          if (r.priceCents !== null && r.priceCents !== undefined)
            updates.priceCents = r.priceCents;
          if (r.costBasisCents !== null && r.costBasisCents !== undefined)
            updates.costBasisCents = r.costBasisCents;
          if (r.condition) updates.condition = r.condition;

          await tx
            .update(inventoryItems)
            .set(updates)
            .where(eq(inventoryItems.id, item.id));
        }

        // Insert movement
        await tx.insert(inventoryStockMovements).values({
          itemId: item.id,
          delta: qtyDelta,
          reason: "IMPORT_ADD",
          note: r.notes || null,
        } as any);

        // Update cached onHand
        await tx
          .update(inventoryItems)
          .set({
            onHand: sql`${inventoryItems.onHand} + ${qtyDelta}`,
            updatedAt: sql`now()`,
          })
          .where(eq(inventoryItems.id, item.id));

        // Mark row applied
        await tx
          .update(inventoryImportRows)
          .set({
            status: "applied",
            error: null,
            linkedItemId: item.id,
          })
          .where(eq(inventoryImportRows.id, r.id));

        applied.push({
          rowId: r.id,
          itemId: item.id,
          sku: item.sku ?? undefined,
          title,
        });
      } catch (e: any) {
        const msg = e?.message || "Unknown error";
        failed.push({ rowId: r.id, error: msg });

        await tx
          .update(inventoryImportRows)
          .set({ status: "error", error: msg })
          .where(eq(inventoryImportRows.id, r.id));
      }
    }
  });

  return NextResponse.json({
    ok: true,
    appliedCount: applied.length,
    failedCount: failed.length,
    applied,
    failed,
  });
}
