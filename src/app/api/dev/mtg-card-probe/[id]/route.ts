import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> } // <-- Next in your repo wants a Promise here
) {
  const { id } = await context.params; // <-- await the params
  const rawParam = decodeURIComponent((id || "").trim());
  const idNoDashes = rawParam.replace(/-/g, "");

  const meta = await db.execute<{ db: string; usr: string; host: string }>(sql`
    SELECT current_database() AS db,
           current_user AS usr,
           inet_server_addr()::text AS host
  `);

  // STEP 1: probe by id (dashed and no-dash)
  const probe = await db.execute<{ id: string }>(sql`
    SELECT c.id::text AS id
    FROM public.mtg_cards c
    WHERE c.id::text = ${rawParam}
       OR REPLACE(c.id::text,'-','') = ${idNoDashes}
    LIMIT 1
  `);
  let foundId = probe.rows?.[0]?.id ?? null;

  // STEP 1b: set-number fallback if needed
  if (!foundId) {
    const m = rawParam
      .replace(/[–—]/g, "-")
      .replace(":", "-")
      .replace("/", "-")
      .match(/^([A-Za-z0-9]{2,10})-(.+)$/);

    if (m) {
      const set = m[1].toLowerCase();
      const num = decodeURIComponent(m[2]);
      const noZeros = num.replace(/^0+/, "");
      const lower = num.toLowerCase();

      const p2 = await db.execute<{ id: string }>(sql`
        SELECT c.id::text AS id
        FROM public.mtg_cards c
        WHERE LOWER(c.set_code) = ${set}
          AND (
            c.collector_number::text = ${num}
            OR ltrim(c.collector_number::text,'0') = ${noZeros}
            OR LOWER(c.collector_number::text) = ${lower}
          )
        LIMIT 1
      `);
      foundId = p2.rows?.[0]?.id ?? null;
    }
  }

  // STEP 2: full row (with prices) if we found an id
  let card: any = null;
  if (foundId) {
    const row = await db.execute(sql`
      SELECT
        c.id::text AS id,
        c.name,
        c.set_code,
        c.collector_number,
        COALESCE(
          c.image_uris->>'normal',
          c.image_uris->>'large',
          c.image_uris->>'small',
          (c.card_faces_raw->0->'image_uris'->>'normal'),
          (c.card_faces_raw->0->'image_uris'->>'large'),
          (c.card_faces_raw->0->'image_uris'->>'small')
        ) AS image_url,
        e.effective_usd::text AS usd,
        TO_CHAR(e.effective_updated_at,'YYYY-MM-DD') AS updated_at
      FROM public.mtg_cards c
      LEFT JOIN public.mtg_prices_effective e
        ON e.scryfall_id = c.id
      WHERE c.id::text = ${foundId}
      LIMIT 1
    `);
    card = row.rows?.[0] ?? null;
  }

  return NextResponse.json({
    meta: meta.rows?.[0] ?? null,
    input: { rawParam, idNoDashes },
    foundId,
    hasCard: !!card,
    card,
  });
}
