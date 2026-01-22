/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { ListingJsonSchema, type ListingJson } from "@/lib/ai/listingSchema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function norm(v: unknown) {
  return String(v ?? "").trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const generationId = norm(body?.generationId);
    if (!generationId) {
      return NextResponse.json({ error: "bad_request", message: "Missing generationId" }, { status: 400 });
    }

    const gRes = await db.execute(sql`
      select id, product_id as "productId", output_json as "output"
      from ai_listing_generations
      where id = ${generationId}::uuid
      limit 1
    `);

    const gen = (gRes as any)?.rows?.[0];
    if (!gen) return NextResponse.json({ error: "not_found", message: "Generation not found" }, { status: 404 });

    const output = ListingJsonSchema.parse(gen.output) as ListingJson;

    const newTitle = output.product.title ?? null;
    const newSubtitle = output.product.subtitle ?? null;
    const newDescription = output.copy.descriptionMd ?? null;

    await db.execute(sql`
      update products
      set
        title = coalesce(${newTitle}, title),
        subtitle = coalesce(${newSubtitle}, subtitle),
        description = coalesce(${newDescription}, description),
        updated_at = now()
      where id = ${gen.productId}::uuid
    `);

    await db.execute(sql`
      update ai_listing_generations
      set status = 'applied'
      where id = ${generationId}::uuid
    `);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "apply_failed", message: String(err?.message ?? err) },
      { status: 500 },
    );
  }
}
