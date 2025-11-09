import "server-only";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const meta = await db.execute<{ db: string; usr: string; host: string }>(sql`
    SELECT current_database() AS db,
           current_user       AS usr,
           inet_server_addr()::text AS host
  `);

  // sanity: can we see this specific MTG card?
  const card = await db.execute<{ id: string }>(sql`
    SELECT c.id::text
    FROM public.mtg_cards c
    WHERE c.id::text = '84f2c8f5-8e11-4639-b7de-00e4a2cbabee'
    LIMIT 1
  `);

  return NextResponse.json({
    meta: meta.rows?.[0] ?? null,
    canSeeCard: card.rows?.length ? true : false,
    envHostSample: process.env.DATABASE_URL?.split("@")[1]?.split("/")[0] ?? null,
  });
}
