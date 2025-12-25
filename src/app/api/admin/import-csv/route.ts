import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { parseCsv, toIntSafe } from "@/lib/csv";
import { db } from "@/lib/db";
import {
  inventoryImportBatches,
  inventoryImportRows,
} from "@/lib/db/schema/inventory";

export const runtime = "nodejs";

function normalizeGame(v: string) {
  const x = (v || "").toLowerCase().trim();
  const allowed = new Set([
    "pokemon",
    "mtg",
    "yugioh",
    "sports",
    "funko",
    "sealed",
    "videogames",
    "supplies",
    "other",
  ]);
  return allowed.has(x) ? x : "other";
}

export async function POST(req: NextRequest) {
  try {
    const auth = requireAdmin(req);
    if (!auth.ok)
      return NextResponse.json({ error: auth.error }, { status: 401 });

    const form = await req.formData();
    const file = form.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing file field 'file' (multipart/form-data)" },
        { status: 400 }
      );
    }

    const text = await file.text();
    const { headers, rows } = parseCsv(text);

    if (!headers.length) {
      return NextResponse.json(
        { error: "CSV appears empty or missing header row" },
        { status: 400 }
      );
    }

    const created = await db
      .insert(inventoryImportBatches)
      .values({ filename: file.name || "upload.csv" })
      .returning();

    const batch: any = created[0];
    if (!batch?.id) {
      return NextResponse.json(
        { error: "Failed to create import batch" },
        { status: 500 }
      );
    }

    const insertRows = rows.map((r) => {
      const game = normalizeGame(r["game"]);
      const sku = (r["sku"] || "").trim() || null;
      const title = (r["title"] || "").trim() || null;
      const condition = (r["condition"] || "").trim() || null;
      const qtyDelta = toIntSafe(r["qty_delta"], null);
      const priceCents = toIntSafe(r["price_cents"], null);
      const costBasisCents = toIntSafe(r["cost_basis_cents"], null);
      const notes = (r["notes"] || "").trim() || null;
      const imageUrls = (r["image_urls"] || "").trim() || null;

      let status: "pending" | "error" = "pending";
      let error: string | null = null;

      if (!title) {
        status = "error";
        error = "Missing title";
      } else if (qtyDelta === null) {
        status = "error";
        error = "Missing or invalid qty_delta (must be integer, e.g. 1, 10, -2)";
      }

      return {
        batchId: batch.id,
        status,
        error,
        raw: r,

        game,
        sku,
        title,
        condition: condition ?? "",
        qtyDelta: qtyDelta ?? null,
        priceCents: priceCents ?? null,
        costBasisCents: costBasisCents ?? null,
        notes,
        imageUrls,
      };
    });

    await db.insert(inventoryImportRows).values(insertRows as any);

    return NextResponse.json({
      ok: true,
      batchId: batch.id,
      totalRows: insertRows.length,
      errors: insertRows.filter((x) => x.status === "error").length,
    });
  } catch (err: any) {
    console.error("[api/admin/import-csv] ERROR:", err);
    return NextResponse.json(
      {
        error: "Import failed",
        detail: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}
