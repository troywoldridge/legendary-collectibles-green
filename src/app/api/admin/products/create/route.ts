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

function toInt(v: unknown, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function toBool(v: unknown, fallback = false) {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes") return true;
    if (s === "false" || s === "0" || s === "no") return false;
  }
  return fallback;
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

// Keep these aligned to your Postgres enums
const ALLOWED_GAME = new Set(["pokemon", "yugioh", "mtg", "sports", "funko"]);
const ALLOWED_FORMAT = new Set(["single", "pack", "box", "bundle", "lot", "accessory"]);
const ALLOWED_STATUS = new Set(["draft", "active", "archived"]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const title = norm(body?.title);
    const slug = norm(body?.slug);

    const game = norm(body?.game).toLowerCase();
    const format = norm(body?.format).toLowerCase();
    const status = norm(body?.status).toLowerCase();

    const sku = norm(body?.sku) || null;

    // booleans
    const sealed = toBool(body?.sealed, false);
    const isGraded = toBool(body?.isGraded ?? body?.is_graded, false);

    // optional grading fields
    const grader = norm(body?.grader).toLowerCase() || null;
    const gradeX10Raw = body?.gradeX10 ?? body?.grade_x10;
    const gradeX10 = gradeX10Raw === null || gradeX10Raw === undefined ? null : toInt(gradeX10Raw, 0);

    // optional condition enum code (nm/lp/mp/hp/dmg)
    const condition = norm(body?.condition).toLowerCase() || null;

    // price/qty
    const priceCentsRaw = body?.priceCents ?? body?.price_cents;
    const priceCents = toInt(priceCentsRaw, 0);
    const quantityRaw = body?.quantity;
    const quantity = toInt(quantityRaw, 0);

    // optional
    const subtitle = norm(body?.subtitle) || null;
    const description = norm(body?.description) || null;

    // optional source fields
    const sourceCardId = norm(body?.sourceCardId ?? body?.source_card_id) || null;
    const sourceSetCode = norm(body?.sourceSetCode ?? body?.source_set_code) || null;
    const sourceSetName = norm(body?.sourceSetName ?? body?.source_set_name) || null;
    const sourceNumber = norm(body?.sourceNumber ?? body?.source_number) || null;

    if (!title) {
      return NextResponse.json({ ok: false, error: "bad_request", message: "Missing title" }, { status: 400 });
    }
    if (!slug) {
      return NextResponse.json({ ok: false, error: "bad_request", message: "Missing slug" }, { status: 400 });
    }
    if (!game || !ALLOWED_GAME.has(game)) {
      return NextResponse.json(
        { ok: false, error: "bad_request", message: `Invalid game. Must be one of: ${Array.from(ALLOWED_GAME).join(", ")}` },
        { status: 400 },
      );
    }
    if (!format || !ALLOWED_FORMAT.has(format)) {
      return NextResponse.json(
        { ok: false, error: "bad_request", message: `Invalid format. Must be one of: ${Array.from(ALLOWED_FORMAT).join(", ")}` },
        { status: 400 },
      );
    }
    if (!status || !ALLOWED_STATUS.has(status)) {
      return NextResponse.json(
        { ok: false, error: "bad_request", message: `Invalid status. Must be one of: ${Array.from(ALLOWED_STATUS).join(", ")}` },
        { status: 400 },
      );
    }
    if (priceCents < 0) {
      return NextResponse.json({ ok: false, error: "bad_request", message: "priceCents must be >= 0" }, { status: 400 });
    }
    if (quantity < 0) {
      return NextResponse.json({ ok: false, error: "bad_request", message: "quantity must be >= 0" }, { status: 400 });
    }

    // optional: if user passes a UUID as id, accept it
    const id = norm(body?.id);
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
        ${grader}::grader,
        ${gradeX10},
        ${condition}::card_condition,
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
    // Most common: slug unique violation, sku unique, enum mismatch
    return NextResponse.json(
      { ok: false, error: "create_failed", message: String(err?.message ?? err) },
      { status: 500 },
    );
  }
}
