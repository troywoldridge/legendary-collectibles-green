// src/app/api/admin/products/create/route.ts
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

function emptyToNull(v: unknown): string | null {
  const s = norm(v);
  return s ? s : null;
}

function toIntOrNull(v: unknown): number | null {
  const s = norm(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toInt(v: unknown, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function toBool(v: unknown, fallback = false) {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes" || s === "on") return true;
    if (s === "false" || s === "0" || s === "no" || s === "off") return false;
  }
  return fallback;
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

// Keep these aligned to your Postgres enums
const ALLOWED_GAME = new Set(["pokemon", "yugioh", "mtg", "sports", "funko"]);
const ALLOWED_FORMAT = new Set(["single", "pack", "box", "bundle", "lot", "accessory"]);
const ALLOWED_STATUS = new Set(["draft", "active", "archived"]);

// Optional safety validation (only enforced when provided)
const ALLOWED_GRADER = new Set(["psa", "bgs", "cgc"]);
// Make sure these match your `card_condition` enum EXACTLY
const ALLOWED_CONDITION = new Set(["nm", "lp", "mp", "hp", "dmg", "new_factory_sealed"]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const title = norm((body as any)?.title);
    const slug = norm((body as any)?.slug);

    const game = norm((body as any)?.game).toLowerCase();
    const format = norm((body as any)?.format).toLowerCase();
    const status = norm((body as any)?.status).toLowerCase();

    const sku = emptyToNull((body as any)?.sku);

    // booleans
    const sealed = toBool((body as any)?.sealed, false);
    const isGraded = toBool((body as any)?.isGraded ?? (body as any)?.is_graded, false);

    // optional grading fields
    const graderRaw = emptyToNull((body as any)?.grader);
    const grader = graderRaw ? graderRaw.toLowerCase() : null;

    const gradeX10Raw = (body as any)?.gradeX10 ?? (body as any)?.grade_x10;
    const gradeX10 = toIntOrNull(gradeX10Raw);

    // optional condition enum code
    const conditionRaw = emptyToNull((body as any)?.condition);
    const conditionLower = conditionRaw ? conditionRaw.toLowerCase() : null;

    // price/qty
    const priceCentsRaw = (body as any)?.priceCents ?? (body as any)?.price_cents;
    const priceCents = toInt(priceCentsRaw, 0);

    const quantityRaw = (body as any)?.quantity;
    const quantity = toInt(quantityRaw, 0);

    // optional
    const subtitle = emptyToNull((body as any)?.subtitle);
    const description = emptyToNull((body as any)?.description);

    // optional source fields
    const sourceCardId = emptyToNull((body as any)?.sourceCardId ?? (body as any)?.source_card_id);
    const sourceSetCode = emptyToNull((body as any)?.sourceSetCode ?? (body as any)?.source_set_code);
    const sourceSetName = emptyToNull((body as any)?.sourceSetName ?? (body as any)?.source_set_name);
    const sourceNumber = emptyToNull((body as any)?.sourceNumber ?? (body as any)?.source_number);

    // REQUIRED for Step 1 insert
    if (!title) {
      return NextResponse.json({ ok: false, error: "bad_request", message: "Missing title" }, { status: 400 });
    }
    if (!slug) {
      return NextResponse.json({ ok: false, error: "bad_request", message: "Missing slug" }, { status: 400 });
    }
    if (!game || !ALLOWED_GAME.has(game)) {
      return NextResponse.json(
        {
          ok: false,
          error: "bad_request",
          message: `Invalid game. Must be one of: ${Array.from(ALLOWED_GAME).join(", ")}`,
        },
        { status: 400 },
      );
    }
    if (!format || !ALLOWED_FORMAT.has(format)) {
      return NextResponse.json(
        {
          ok: false,
          error: "bad_request",
          message: `Invalid format. Must be one of: ${Array.from(ALLOWED_FORMAT).join(", ")}`,
        },
        { status: 400 },
      );
    }
    if (!status || !ALLOWED_STATUS.has(status)) {
      return NextResponse.json(
        {
          ok: false,
          error: "bad_request",
          message: `Invalid status. Must be one of: ${Array.from(ALLOWED_STATUS).join(", ")}`,
        },
        { status: 400 },
      );
    }

    if (grader && !ALLOWED_GRADER.has(grader)) {
      return NextResponse.json(
        {
          ok: false,
          error: "bad_request",
          message: `Invalid grader. Must be one of: ${Array.from(ALLOWED_GRADER).join(", ")}`,
        },
        { status: 400 },
      );
    }

    // If graded, raw condition should be NULL (matches your UI intent)
    const finalCondition = isGraded ? null : conditionLower;

    if (finalCondition && !ALLOWED_CONDITION.has(finalCondition)) {
      return NextResponse.json(
        {
          ok: false,
          error: "bad_request",
          message: `Invalid condition. Must be one of: ${Array.from(ALLOWED_CONDITION).join(", ")}`,
        },
        { status: 400 },
      );
    }

    // If not graded, force grader/grade null
    const finalGrader = isGraded ? grader : null;
    const finalGradeX10 = isGraded ? gradeX10 : null;

    if (priceCents < 0) {
      return NextResponse.json(
        { ok: false, error: "bad_request", message: "priceCents must be >= 0" },
        { status: 400 },
      );
    }
    if (quantity < 0) {
      return NextResponse.json(
        { ok: false, error: "bad_request", message: "quantity must be >= 0" },
        { status: 400 },
      );
    }

    // optional: if user passes a UUID as id, accept it
    const id = norm((body as any)?.id);
    const idOrNull = id && isUuid(id) ? id : null;

    const ins = await db.execute(sql`
  insert into products (
    id,
    title,
    slug,
    sku,
    game,
    format,
    sealed,
    is_graded,
    grader,
    grade_x10,
    condition,
    price_cents,
    quantity,
    status,
    subtitle,
    description,
    source_card_id,
    source_set_code,
    source_set_name,
    source_number
  )
  values (
    coalesce(${idOrNull}::uuid, gen_random_uuid()),
    ${title},
    ${slug},
    ${sku},
    ${game}::game,
    ${format}::product_format,
    ${sealed},
    ${isGraded},

    /* OPTIONAL enum: grader (safe for null/blank) */
    NULLIF(${finalGrader}, '')::grader,

    /* grade_x10 (nullable) */
    ${finalGradeX10},

    /* OPTIONAL enum: condition (safe for null/blank) */
    NULLIF(${finalCondition}, '')::card_condition,

    ${priceCents},
    ${quantity},
    ${status}::product_status,
    ${subtitle},
    ${description},
    ${sourceCardId},
    ${sourceSetCode},
    ${sourceSetName},
    ${sourceNumber}
  )
  returning id, slug
`);


    const row = (ins as any)?.rows?.[0];
    return NextResponse.json({ ok: true, product: row });
  } catch (err: any) {
  // Try to expose the *real* Postgres error (code/detail/constraint)
  const e = err?.cause ?? err;

  return NextResponse.json(
    {
      ok: false,
      error: "create_failed",
      message: String(e?.message ?? err?.message ?? err),
      code: e?.code ?? err?.code ?? null,
      detail: e?.detail ?? null,
      hint: e?.hint ?? null,
      where: e?.where ?? null,
      schema: e?.schema ?? null,
      table: e?.table ?? null,
      column: e?.column ?? null,
      constraint: e?.constraint ?? null,
    },
    { status: 500 },
  );
}

}
