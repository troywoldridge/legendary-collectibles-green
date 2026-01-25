// src/app/api/collection/funko/route.ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Body = {
  itemId?: string;
  variantType?: string; // default "normal"
  qty?: number; // default 1
  mode?: "add" | "decrement"; // default "add"
};

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    body = {};
  }

  const itemId = String(body.itemId ?? "").trim();
  if (!itemId) return NextResponse.json({ error: "bad_request", message: "Missing itemId" }, { status: 400 });

  const variantType = String(body.variantType ?? "normal").trim() || "normal";
  const qty = clampInt(Number(body.qty ?? 1) || 1, 1, 99);
  const mode = body.mode === "decrement" ? "decrement" : "add";

  // add/upsert or decrement
  if (mode === "add") {
    await db.execute(sql`
      INSERT INTO public.user_collection_items (user_id, game, card_id, variant_type, quantity)
      VALUES (${userId}, 'funko', ${itemId}, ${variantType}, ${qty})
      ON CONFLICT (user_id, game, card_id, variant_type)
      DO UPDATE SET quantity = public.user_collection_items.quantity + EXCLUDED.quantity
    `);
  } else {
    await db.execute(sql`
      UPDATE public.user_collection_items
      SET quantity = GREATEST(COALESCE(quantity,0) - ${qty}, 0)
      WHERE user_id = ${userId}
        AND game = 'funko'
        AND card_id = ${itemId}
        AND variant_type = ${variantType}
    `);

    await db.execute(sql`
      DELETE FROM public.user_collection_items
      WHERE user_id = ${userId}
        AND game = 'funko'
        AND card_id = ${itemId}
        AND variant_type = ${variantType}
        AND COALESCE(quantity,0) <= 0
    `);
  }

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const itemId = (url.searchParams.get("itemId") ?? "").trim();
  const variantType = (url.searchParams.get("variantType") ?? "").trim();

  if (!itemId) return NextResponse.json({ error: "bad_request", message: "Missing itemId" }, { status: 400 });

  if (variantType) {
    await db.execute(sql`
      DELETE FROM public.user_collection_items
      WHERE user_id = ${userId}
        AND game = 'funko'
        AND card_id = ${itemId}
        AND variant_type = ${variantType}
    `);
  } else {
    // delete all variants for this item
    await db.execute(sql`
      DELETE FROM public.user_collection_items
      WHERE user_id = ${userId}
        AND game = 'funko'
        AND card_id = ${itemId}
    `);
  }

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
