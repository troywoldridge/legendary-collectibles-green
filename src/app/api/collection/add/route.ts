// src/app/api/collection/add/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";

type Body = {
  game?: string;
  cardId?: string;
  cardName?: string;
  setName?: string;
  imageUrl?: string;
  grading_company?: string;
  grade_label?: string;
  cert_number?: string | null;
  purchase_date?: string | null;
  quantity?: number;
  folder?: string | null;
  cost_cents?: number | null;
};

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // ---- Core fields ----
  const game = (body.game ?? "").trim().toLowerCase();
  const cardId = (body.cardId ?? "").trim();

  const cardName = body.cardName?.trim() ?? null;
  const setName = body.setName?.trim() ?? null;
  const imageUrl = body.imageUrl?.trim() ?? null;

  const gradingCompany = (body.grading_company ?? "UNGR").toUpperCase();
  const gradeLabel = body.grade_label ?? "Ungraded";
  const certNumber = body.cert_number?.trim() || null;
  const purchaseDate = body.purchase_date ?? null;

  const qtyRaw = body.quantity ?? 1;
  const quantity =
    Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.floor(qtyRaw) : 1;

  const folder = body.folder ?? null;

  const costCents =
    typeof body.cost_cents === "number" && Number.isFinite(body.cost_cents)
      ? Math.floor(body.cost_cents)
      : null;

  if (!game || !cardId) {
    return NextResponse.json(
      { error: "Missing required fields game/cardId" },
      { status: 400 }
    );
  }

  try {
    await db.execute(
      sql`
        INSERT INTO user_collection_items (
          user_id,
          game,
          card_id,
          card_name,
          set_name,
          image_url,
          grading_company,
          grade_label,
          cert_number,
          purchase_date,
          quantity,
          folder,
          cost_cents
        )
        VALUES (
          ${userId},
          ${game},
          ${cardId},
          ${cardName},
          ${setName},
          ${imageUrl},
          ${gradingCompany},
          ${gradeLabel},
          ${certNumber},
          ${purchaseDate},
          ${quantity},
          ${folder},
          ${costCents}
        )
        ON CONFLICT (
          user_id,
          game,
          card_id,
          grading_company,
          grade_label,
          COALESCE(cert_number,'')
        )
        DO UPDATE SET
          quantity   = user_collection_items.quantity + EXCLUDED.quantity,
          folder     = COALESCE(EXCLUDED.folder, user_collection_items.folder),
          cost_cents = COALESCE(EXCLUDED.cost_cents, user_collection_items.cost_cents),
          updated_at = NOW()
      `
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("collection/add failed", err);
    return NextResponse.json(
      { error: "Database error inserting collection item" },
      { status: 500 }
    );
  }
}
