/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/api/collection/update/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id } = body ?? {};
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  // Ensure the row exists AND belongs to the user
  const existing = await db.execute(
    sql`SELECT id FROM user_collection_items WHERE id = ${id} AND user_id = ${userId} LIMIT 1`
  );
  if (existing.rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Helper: run an update for a single column
  async function updateColumn(column: string, value: any) {
    // column is trusted here because we only call with known literals below
    if (column === "quantity") {
      // basic safety
      const q = Number(value);
      if (!Number.isFinite(q) || q < 1) return;
    }

    await db.execute(sql`
      UPDATE user_collection_items
      SET ${sql.raw(column)} = ${value}, updated_at = now()
      WHERE id = ${id} AND user_id = ${userId}
    ` as any);
  }

  const {
    grading_company,
    grade_label,
    quantity,
    folder,
    cost_cents,
    cert_number,
    purchase_date,
    last_value_cents,
  } = body;

  // Apply any fields that were provided
  if (grading_company !== undefined) {
    await updateColumn("grading_company", String(grading_company));
  }
  if (grade_label !== undefined) {
    await updateColumn("grade_label", String(grade_label));
  }
  if (quantity !== undefined) {
    await updateColumn("quantity", Number(quantity));
  }
  if (folder !== undefined) {
    await updateColumn("folder", folder === "" ? null : String(folder));
  }
  if (cost_cents !== undefined) {
    const v =
      cost_cents === null || cost_cents === ""
        ? null
        : Number.isFinite(Number(cost_cents))
        ? Math.round(Number(cost_cents))
        : null;
    await updateColumn("cost_cents", v);
  }
  if (last_value_cents !== undefined) {
    const v =
      last_value_cents === null || last_value_cents === ""
        ? null
        : Number.isFinite(Number(last_value_cents))
        ? Math.round(Number(last_value_cents))
        : null;
    await updateColumn("last_value_cents", v);
  }
  if (cert_number !== undefined) {
    await updateColumn("cert_number", cert_number === "" ? null : String(cert_number));
  }
  if (purchase_date !== undefined) {
    // Expect YYYY-MM-DD or null
    const v = purchase_date === "" || purchase_date == null ? null : String(purchase_date);
    await updateColumn("purchase_date", v);
  }

  return NextResponse.json({ ok: true });
}
