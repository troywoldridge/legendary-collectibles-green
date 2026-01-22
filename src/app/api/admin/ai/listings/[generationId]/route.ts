/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function norm(v: unknown) {
  return String(v ?? "").trim();
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ generationId: string }> }) {
  const p = await ctx.params;
  const generationId = norm(p?.generationId);

  if (!generationId) {
    return NextResponse.json(
      { ok: false, error: "bad_request", message: "Missing generationId" },
      { status: 400 },
    );
  }

  const res = await db.execute(sql`
    select
      g.id,
      g.product_id as "productId",
      g.status,
      g.model,
      g.schema_version as "schemaVersion",
      g.output_json as "output",
      g.error_text as "errorText",
      g.created_at as "createdAt",
      g.updated_at as "updatedAt"
    from ai_listing_generations g
    where g.id = ${generationId}::uuid
    limit 1
  `);

  const row = (res as any)?.rows?.[0];
  if (!row) {
    return NextResponse.json(
      { ok: false, error: "not_found", message: "Generation not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, row });
}
