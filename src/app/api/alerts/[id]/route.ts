/* eslint-disable @typescript-eslint/no-unused-vars */
// PATCH /api/alerts/[id]
// DELETE /api/alerts/[id]
import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { priceAlerts } from "@/lib/db/schema/priceAlerts";
import { and, eq } from "drizzle-orm";

export async function PATCH(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const alertId = Number(params.id);

  const body = await _req.json();

  const updated = await db
    .update(priceAlerts)
    .set(body)
    .where(eq(priceAlerts.id, alertId))
    .returning();

  return NextResponse.json(updated[0]);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const alertId = Number(params.id);

  await db.delete(priceAlerts).where(eq(priceAlerts.id, alertId));

  return NextResponse.json({ ok: true });
}
