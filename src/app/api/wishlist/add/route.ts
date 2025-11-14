// src/app/api/wishlist/add/route.ts
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
};

export async function POST(req: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const game = body.game?.trim();
  const cardId = body.cardId?.trim();

  if (!game || !cardId) {
    return NextResponse.json(
      { error: "Missing required fields: game and cardId" },
      { status: 400 }
    );
  }

  const cardName = body.cardName?.trim() || null;
  const setName = body.setName?.trim() || null;
  const imageUrl = body.imageUrl?.trim() || null;

  await db.execute(
    sql`
      INSERT INTO user_wishlist_items (
        user_id,
        game,
        card_id,
        card_name,
        set_name,
        image_url
      )
      VALUES (
        ${userId},
        ${game},
        ${cardId},
        ${cardName},
        ${setName},
        ${imageUrl}
      )
      ON CONFLICT (user_id, game, card_id) DO NOTHING
    `
  );

  return NextResponse.json({ ok: true });
}
