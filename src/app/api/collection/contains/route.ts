// src/app/api/collection/contains/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type Body = {
  game?: string;
  cardIds?: string[];
};

export async function POST(req: Request) {
  try {
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

    const game = (body.game ?? "").trim().toLowerCase();
    const rawIds = Array.isArray(body.cardIds) ? body.cardIds : [];

    const ids = rawIds
      .map((x) => String(x ?? "").trim())
      .filter(Boolean)
      .slice(0, 500);

    if (!game || ids.length === 0) {
      return NextResponse.json({ map: {} }, { status: 200 });
    }

    // Build: ARRAY[$3,$4,$5...]::text[]
    const idsArrayExpr = sql`ARRAY[${sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `,
    )}]::text[]`;

    const res = await db.execute<{ card_id: string; qty: number }>(sql`
      SELECT card_id, COALESCE(SUM(quantity), 0)::int AS qty
      FROM user_collection_items
      WHERE user_id = ${userId}
        AND game = ${game}
        AND card_id = ANY(${idsArrayExpr})
      GROUP BY card_id
    `);

    const qtyById = new Map<string, number>();
    for (const r of res.rows ?? []) qtyById.set(String(r.card_id), Number(r.qty) || 0);

    const map: Record<string, { inCollection: boolean; quantity: number }> = {};
    for (const id of ids) {
      const qty = qtyById.get(id) ?? 0;
      map[id] = { inCollection: qty > 0, quantity: qty };
    }

    return NextResponse.json({ map }, { status: 200 });
  } catch (err) {
    console.error("collection/contains failed", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
