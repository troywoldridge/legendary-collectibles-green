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

function toIntParam(v: string | null, fallback: number) {
  if (v == null || v.trim() === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const q = (searchParams.get("q") || "").trim();
  const status = (searchParams.get("status") || "").trim(); // product_status text
  const game = (searchParams.get("game") || "").trim(); // optional
  const format = (searchParams.get("format") || "").trim(); // optional

  const limit = clamp(toIntParam(searchParams.get("limit"), 25), 1, 100);
  const offset = Math.max(0, toIntParam(searchParams.get("offset"), 0));

  const rowsRes = await db.execute(sql`
    with base as (
      select
        p.id,
        p.title,
        p.slug,
        p.sku,
        p.game::text as game,
        p.format::text as format,
        p.sealed,
        p.is_graded as "isGraded",
        p.grader::text as grader,
        p.grade_x10 as "gradeX10",
        p.condition::text as condition,
        p.price_cents as "priceCents",
        p.quantity,
        p.status::text as status,
        p.updated_at as "updatedAt",
        (select count(*) from product_images i where i.product_id = p.id) as "imageCount"
      from products p
      where
        (${q} = '' OR
          p.title ilike ('%' || ${q} || '%') OR
          p.slug ilike ('%' || ${q} || '%') OR
          coalesce(p.sku,'') ilike ('%' || ${q} || '%')
        )
        AND (${status} = '' OR p.status::text = ${status})
        AND (${game} = '' OR p.game::text = ${game})
        AND (${format} = '' OR p.format::text = ${format})
      order by p.updated_at desc
      limit ${limit}
      offset ${offset}
    )
    select * from base;
  `);

  const rows = (rowsRes as any)?.rows ?? [];

  // Optional: total count for pagination UI
  const countRes = await db.execute(sql`
    select count(*)::int as count
    from products p
    where
      (${q} = '' OR
        p.title ilike ('%' || ${q} || '%') OR
        p.slug ilike ('%' || ${q} || '%') OR
        coalesce(p.sku,'') ilike ('%' || ${q} || '%')
      )
      AND (${status} = '' OR p.status::text = ${status})
      AND (${game} = '' OR p.game::text = ${game})
      AND (${format} = '' OR p.format::text = ${format})
  `);

  const total = (countRes as any)?.rows?.[0]?.count ?? 0;

  return NextResponse.json({ ok: true, rows, limit, offset, total });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const title = norm(body?.title);
    const slug = norm(body?.slug);

    // required enums (your DB enforces NOT NULL)
    const game = norm(body?.game);
    const format = norm(body?.format);

    // optional-ish fields with sane defaults
    const sealed = Boolean(body?.sealed ?? false);
    const priceCents = Number.isFinite(Number(body?.priceCents)) ? Math.trunc(Number(body.priceCents)) : 0;
    const quantity = Number.isFinite(Number(body?.quantity)) ? Math.trunc(Number(body.quantity)) : 0;
    const status = norm(body?.status) || "draft";

    if (!title) {
      return NextResponse.json({ ok: false, error: "bad_request", message: "Missing title" }, { status: 400 });
    }
    if (!slug) {
      return NextResponse.json({ ok: false, error: "bad_request", message: "Missing slug" }, { status: 400 });
    }
    if (!game) {
      return NextResponse.json({ ok: false, error: "bad_request", message: "Missing game" }, { status: 400 });
    }
    if (!format) {
      return NextResponse.json({ ok: false, error: "bad_request", message: "Missing format" }, { status: 400 });
    }

    const ins = await db.execute(sql`
      insert into products (
        title, slug, game, format, sealed,
        price_cents, quantity, status
      )
      values (
        ${title},
        ${slug},
        ${game}::game,
        ${format}::product_format,
        ${sealed},
        ${priceCents},
        ${quantity},
        ${status}::product_status
      )
      returning
        id,
        title,
        slug
    `);

    const row = (ins as any)?.rows?.[0] ?? null;
    if (!row) throw new Error("Insert failed");

    return NextResponse.json({ ok: true, product: row });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "create_failed", message: String(err?.message ?? err) },
      { status: 500 },
    );
  }
}
