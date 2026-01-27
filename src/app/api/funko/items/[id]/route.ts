// src/app/api/funko/items/[id]/route.ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function norm(v: unknown) {
  return String(v ?? "").trim();
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const p = await ctx.params;
    const id = norm(p?.id);

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "bad_request", message: "Missing id." },
        { status: 400 },
      );
    }

    const res = await db.execute(sql`
      select
        id,
        name,
        franchise,
        series,
        line,
        number,
        edition,
        variant,
        is_chase as "isChase",
        is_exclusive as "isExclusive",
        exclusivity,
        release_year as "releaseYear",
        upc,
        description,
        image_small as "imageSmall",
        image_large as "imageLarge",
        source,
        source_id as "sourceId",
        extra,
        created_at as "createdAt",
        updated_at as "updatedAt"
      from funko_items
      where id = ${id}
      limit 1;
    `);

    const item = (res as any).rows?.[0] ?? null;

    if (!item) {
      return NextResponse.json(
        { ok: false, error: "not_found", message: "Funko item not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, item });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "fetch_failed", message: e?.message || String(e) },
      { status: 500 },
    );
  }
}
