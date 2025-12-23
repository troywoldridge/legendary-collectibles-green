/* eslint-disable @typescript-eslint/no-unused-vars */
// PATCH /api/alerts/[id]
// DELETE /api/alerts/[id]
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { priceAlerts } from "@/lib/db/schema/priceAlerts";
import { eq } from "drizzle-orm";

type AlertRouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(
  req: NextRequest,
  context: AlertRouteContext
) {
  const { id } = await context.params;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const alertId = Number(id);
  const body = await req.json();

  const updated = await db
    .update(priceAlerts)
    .set(body)
    .where(eq(priceAlerts.id, alertId))
    .returning();

  return NextResponse.json(updated[0]);
}

export async function DELETE(
  _req: NextRequest,
  context: AlertRouteContext
) {
  const { id } = await context.params;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const alertId = Number(id);

  await db.delete(priceAlerts).where(eq(priceAlerts.id, alertId));

  return NextResponse.json({ ok: true });
}
