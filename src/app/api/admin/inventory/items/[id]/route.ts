import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { id } = await context.params;

  const res = await db.execute(sql`
    SELECT
      id, game, sku, title, condition, status,
      on_hand, price_cents, cost_basis_cents,
      meta, created_at, updated_at
    FROM inventory_items
    WHERE id = ${id}
    LIMIT 1
  `);

  const item = (res as any).rows?.[0] ?? null;
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ item });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { id } = await context.params;

  const body = await req.json().catch(() => ({} as any));

  const title = typeof body.title === "string" ? body.title.trim() : undefined;
  const condition = typeof body.condition === "string" ? body.condition : undefined;
  const game = typeof body.game === "string" ? body.game : undefined;

  const priceCents =
    body.priceCents === null || body.priceCents === undefined
      ? undefined
      : Number(body.priceCents);

  const costBasisCents =
    body.costBasisCents === null || body.costBasisCents === undefined
      ? undefined
      : Number(body.costBasisCents);

  // meta can be object; store as jsonb
  const meta = body.meta && typeof body.meta === "object" ? body.meta : undefined;

  if (title !== undefined && !title) {
    return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
  }
  if (priceCents !== undefined && (!Number.isFinite(priceCents) || priceCents < 0)) {
    return NextResponse.json({ error: "priceCents must be a non-negative number" }, { status: 400 });
  }
  if (costBasisCents !== undefined && (!Number.isFinite(costBasisCents) || costBasisCents < 0)) {
    return NextResponse.json({ error: "costBasisCents must be a non-negative number" }, { status: 400 });
  }

  const res = await db.execute(sql`
    UPDATE inventory_items
    SET
      title = COALESCE(${title ?? null}, title),
      condition = COALESCE(${condition ?? null}, condition),
      game = COALESCE(${game ?? null}, game),
      price_cents = COALESCE(${priceCents ?? null}, price_cents),
      cost_basis_cents = COALESCE(${costBasisCents ?? null}, cost_basis_cents),
      meta = COALESCE(${meta ? sql`${JSON.stringify(meta)}::jsonb` : null}, meta),
      updated_at = now()
    WHERE id = ${id}
    RETURNING
      id, game, sku, title, condition, status,
      on_hand, price_cents, cost_basis_cents,
      meta, created_at, updated_at
  `);

  const item = (res as any).rows?.[0] ?? null;
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ item });
}
