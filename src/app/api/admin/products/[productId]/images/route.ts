import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";



function norm(v: unknown) {
  return String(v ?? "").trim();
}

function emptyToNull(v: unknown): string | null {
  const s = norm(v);
  return s ? s : null;
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function toBool(v: unknown, fallback = false) {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1 ? true : v === 0 ? false : fallback;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes" || s === "on") return true;
    if (s === "false" || s === "0" || s === "no" || s === "off") return false;
  }
  return fallback;
}


function toInt(v: unknown, fallback: number) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

type ImgRow = {
  id: string;
  productId: string;
  url: string;
  alt: string | null;
  sort: number;
  isStock: boolean;
  createdAt: string;
};

async function guard(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: "unauthorized", message: auth.error },
      { status: 401 },
    );
  }
  return null;
}

function mapImgRows(rowsUnknown: unknown): ImgRow[] {
  const rows = Array.isArray(rowsUnknown) ? rowsUnknown : [];
  const out: ImgRow[] = [];

  for (const r of rows) {
    if (!isObject(r)) continue;

    const id = typeof r.id === "string" ? r.id : null;
    const productId = typeof r.productId === "string" ? r.productId : null;
    const url = typeof r.url === "string" ? r.url : null;

    const alt = r.alt === null ? null : (typeof r.alt === "string" ? r.alt : null);

    const sort = toInt(r.sort, 0);
    const isStock = toBool(r.isStock, false);
    const createdAt = typeof r.createdAt === "string" ? r.createdAt : "";

    if (!id || !productId || !url) continue;

    out.push({ id, productId, url, alt, sort, isStock, createdAt });
  }

  return out;
}

function pickNextSort(rowsUnknown: unknown): number {
  const rows = Array.isArray(rowsUnknown) ? rowsUnknown : [];
  const first = rows[0];
  if (!isObject(first)) return 0;
  return toInt(first.next, 0);
}

function pickReturnedId(rowsUnknown: unknown): string | null {
  const rows = Array.isArray(rowsUnknown) ? rowsUnknown : [];
  const first = rows[0];
  if (!isObject(first)) return null;
  return typeof first.id === "string" ? first.id : null;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ productId: string }> }) {
  const denied = await guard(req);
  if (denied) return denied;

  const { productId } = await ctx.params;
  const pid = norm(productId);

  if (!isUuid(pid)) {
    return NextResponse.json(
      { ok: false, error: "bad_request", message: "Invalid productId" },
      { status: 400 },
    );
  }

  const res = await db.execute(sql`
    select
      id,
      product_id as "productId",
      url,
      alt,
      sort,
      is_stock as "isStock",
      created_at as "createdAt"
    from product_images
    where product_id = ${pid}::uuid
    order by sort asc, created_at asc
  `);

  const rows = mapImgRows((res as unknown as { rows?: unknown })?.rows);

  return NextResponse.json({ ok: true, rows });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ productId: string }> }) {
  const denied = await guard(req);
  if (denied) return denied;

  const { productId } = await ctx.params;
  const pid = norm(productId);

  if (!isUuid(pid)) {
    return NextResponse.json(
      { ok: false, error: "bad_request", message: "Invalid productId" },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const url = norm(body.url);
  const alt = emptyToNull(body.alt);
  const isStock = toBool(body.isStock, false);

  // sort can be omitted; compute next
  const sortInput = body.sort;
  const sortParsed = Number.isFinite(typeof sortInput === "number" ? sortInput : Number(sortInput))
    ? toInt(sortInput, 0)
    : null;

  if (!url) {
    return NextResponse.json(
      { ok: false, error: "bad_request", message: "Missing url" },
      { status: 400 },
    );
  }

  let finalSort = sortParsed;

  if (finalSort === null) {
    const sRes = await db.execute(sql`
      select coalesce(max(sort), -1) + 1 as next
      from product_images
      where product_id = ${pid}::uuid
    `);

    finalSort = pickNextSort((sRes as unknown as { rows?: unknown })?.rows);
  }

  const ins = await db.execute(sql`
    insert into product_images (product_id, url, alt, sort, is_stock)
    values (${pid}::uuid, ${url}, ${alt}, ${finalSort}, ${isStock})
    returning
      id,
      product_id as "productId",
      url,
      alt,
      sort,
      is_stock as "isStock",
      created_at as "createdAt"
  `);

  const row = mapImgRows((ins as unknown as { rows?: unknown })?.rows)?.[0] ?? null;

  return NextResponse.json({ ok: true, row });
}

/**
 * PATCH supports:
 * 1) { imageId, isStock }  -> toggle stock flag
 * 2) { order: [{id, sort}, ...] } -> reorder
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ productId: string }> }) {
  const denied = await guard(req);
  if (denied) return denied;

  const { productId } = await ctx.params;
  const pid = norm(productId);

  if (!isUuid(pid)) {
    return NextResponse.json(
      { ok: false, error: "bad_request", message: "Invalid productId" },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  // Case 1: toggle stock
  if (body.imageId) {
    const imageId = norm(body.imageId);
    if (!isUuid(imageId)) {
      return NextResponse.json(
        { ok: false, error: "bad_request", message: "Invalid imageId" },
        { status: 400 },
      );
    }

    const isStock = toBool(body.isStock, false);

    const upd = await db.execute(sql`
      update product_images
      set is_stock = ${isStock}
      where id = ${imageId}::uuid and product_id = ${pid}::uuid
      returning
        id,
        product_id as "productId",
        url,
        alt,
        sort,
        is_stock as "isStock",
        created_at as "createdAt"
    `);

    const row = mapImgRows((upd as unknown as { rows?: unknown })?.rows)?.[0] ?? null;

    if (!row) {
      return NextResponse.json(
        { ok: false, error: "not_found", message: "Image not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, row });
  }

  // Case 2: reorder
  const order = Array.isArray(body.order) ? body.order : null;
  if (!order) {
    return NextResponse.json(
      { ok: false, error: "bad_request", message: "Missing order or imageId" },
      { status: 400 },
    );
  }

  const rawItems = order
    .map((x) => ({
      id: norm((x as Record<string, unknown>)?.id),
      sort: toInt((x as Record<string, unknown>)?.sort, 0),
    }))
    .filter((x) => isUuid(x.id));

  if (rawItems.length === 0) {
    return NextResponse.json(
      { ok: false, error: "bad_request", message: "Order list is empty/invalid" },
      { status: 400 },
    );
  }

  const items = rawItems
    .sort((a, b) => a.sort - b.sort)
    .map((x, idx) => ({ id: x.id, sort: idx }));

  const valuesSql = sql.join(
    items.map((it) => sql`(${it.id}::uuid, ${it.sort}::int)`),
    sql`, `,
  );

  await db.execute(sql`
    update product_images as pi
    set sort = v.sort
    from (values ${valuesSql}) as v(id, sort)
    where pi.id = v.id and pi.product_id = ${pid}::uuid
  `);

  const res = await db.execute(sql`
    select
      id,
      product_id as "productId",
      url,
      alt,
      sort,
      is_stock as "isStock",
      created_at as "createdAt"
    from product_images
    where product_id = ${pid}::uuid
    order by sort asc, created_at asc
  `);

  const rows = mapImgRows((res as unknown as { rows?: unknown })?.rows);

  return NextResponse.json({ ok: true, rows });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ productId: string }> }) {
  const denied = await guard(req);
  if (denied) return denied;

  const { productId } = await ctx.params;
  const pid = norm(productId);

  if (!isUuid(pid)) {
    return NextResponse.json(
      { ok: false, error: "bad_request", message: "Invalid productId" },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const imageId = norm(body.imageId);

  if (!isUuid(imageId)) {
    return NextResponse.json(
      { ok: false, error: "bad_request", message: "Invalid imageId" },
      { status: 400 },
    );
  }

  const del = await db.execute(sql`
    delete from product_images
    where id = ${imageId}::uuid and product_id = ${pid}::uuid
    returning id
  `);

  const deletedId = pickReturnedId((del as unknown as { rows?: unknown })?.rows);

  if (!deletedId) {
    return NextResponse.json(
      { ok: false, error: "not_found", message: "Image not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true });
}
