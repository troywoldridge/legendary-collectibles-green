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
  const startedAt = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    const generationId = norm(body?.generationId);

    if (!generationId) {
      return NextResponse.json(
        { ok: false, error: "bad_request", message: "Missing generationId" },
        { status: 400 },
      );
    }

    // Load generation (must exist)
    const gRes = await db.execute(sql`
      select
        g.id,
        g.product_id as "productId",
        g.status,
        g.output_json as "output"
      from ai_listing_generations g
      where g.id = ${generationId}::uuid
      limit 1
    `);

    const gen = (gRes as any)?.rows?.[0];
    if (!gen) {
      return NextResponse.json(
        { ok: false, error: "not_found", message: "Generation not found" },
        { status: 404 },
      );
    }

    // Validate exact schema (hard gate)
    const output = ListingJsonSchema.parse(gen.output) as ListingJson;

    // Apply logic:
    // - title should come from copy.listingTitle (best, normalized)
    // - subtitle: if generator set product.subtitle use it
    // - description: copy.descriptionMd (canonical)
    const newTitle = output.copy.listingTitle ?? output.copy.shortTitle ?? null;
    const newSubtitle = output.product.subtitle ?? null;
    const newDescription = output.copy.descriptionMd ?? null;

    // If the generator somehow produced empty core fields, do NOT apply.
    if (!newTitle && !newSubtitle && !newDescription) {
      await db.execute(sql`
        update ai_listing_generations
        set
          status = 'error',
          error_text = ${"Apply blocked: generated output had no title/subtitle/description to apply."},
          updated_at = now()
        where id = ${generationId}::uuid
      `);

      return NextResponse.json(
        {
          ok: false,
          error: "apply_blocked",
          message: "Apply blocked: output had no title/subtitle/description.",
        },
        { status: 422 },
      );
    }

    // Write back to products
    await db.execute(sql`
      update products
      set
        title = coalesce(${newTitle}, title),
        subtitle = coalesce(${newSubtitle}, subtitle),
        description = coalesce(${newDescription}, description),
        updated_at = now()
      where id = ${gen.productId}::uuid
    `);

    // Mark generation applied
    await db.execute(sql`
      update ai_listing_generations
      set
        status = 'applied',
        error_text = null,
        updated_at = now()
      where id = ${generationId}::uuid
    `);

    return NextResponse.json({
      ok: true,
      applied: {
        generationId,
        productId: gen.productId,
        titleApplied: newTitle,
        subtitleApplied: newSubtitle,
        descriptionApplied: !!newDescription,
      },
      ms: Date.now() - startedAt,
    });
  } catch (err: any) {
    // If generationId is present, record error on that row too.
    // (Best-effort; don't fail response if logging fails.)
    try {
      const body = await req.json().catch(() => ({}));
      const generationId = norm(body?.generationId);
      if (generationId) {
        await db.execute(sql`
          update ai_listing_generations
          set
            status = 'error',
            error_text = ${String(err?.message ?? err)},
            updated_at = now()
          where id = ${generationId}::uuid
        `);
      }
    } catch {
      // ignore
    }

    return NextResponse.json(
      { ok: false, error: "apply_failed", message: String(err?.message ?? err) },
      { status: 500 },
    );
  }
}
