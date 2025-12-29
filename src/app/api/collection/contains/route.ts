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
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const game = (body.game ?? "").trim().toLowerCase();
    const rawIds = Array.isArray(body.cardIds) ? body.cardIds : [];
    const ids = rawIds.map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 500);

    if (!game || ids.length === 0) return NextResponse.json({ map: {} }, { status: 200 });

    const idsArrayExpr = sql`ARRAY[${sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `,
    )}]::text[]`;

    // ✅ total per card
    const totalsRes = await db.execute<{ card_id: string; qty: number }>(sql`
      SELECT card_id, COALESCE(SUM(quantity), 0)::int AS qty
      FROM public.user_collection_items
      WHERE user_id = ${userId}
        AND game = ${game}
        AND card_id = ANY(${idsArrayExpr})
      GROUP BY card_id
    `);

    // ✅ variant breakdown for Pokemon (if variant_type exists)
    const variantsRes =
      game === "pokemon"
        ? await db.execute<{ card_id: string; variant_type: string; qty: number }>(sql`
            SELECT
              card_id,
              variant_type,
              COALESCE(SUM(quantity), 0)::int AS qty
            FROM public.user_collection_items
            WHERE user_id = ${userId}
              AND game = ${game}
              AND card_id = ANY(${idsArrayExpr})
            GROUP BY card_id, variant_type
          `)
        : { rows: [] as any[] };

    const totalById = new Map<string, number>();
    for (const r of totalsRes.rows ?? []) totalById.set(String(r.card_id), Number(r.qty) || 0);

    const variantsByCard: Record<string, Record<string, number>> = {};
    for (const r of variantsRes.rows ?? []) {
      const cid = String(r.card_id);
      const vt = String(r.variant_type || "normal");
      const q = Number(r.qty) || 0;
      if (!variantsByCard[cid]) variantsByCard[cid] = {};
      variantsByCard[cid][vt] = q;
    }

    const map: Record<
      string,
      { inCollection: boolean; quantity: number; variants?: Record<string, number> }
    > = {};

    for (const id of ids) {
      const qty = totalById.get(id) ?? 0;
      map[id] = {
        inCollection: qty > 0,
        quantity: qty,
        ...(game === "pokemon" ? { variants: variantsByCard[id] ?? {} } : {}),
      };
    }

    return NextResponse.json({ map }, { status: 200 });
  } catch (err) {
    console.error("collection/contains failed", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
