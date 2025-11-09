// src/app/api/plans/activate-free/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { userPlans } from "@/lib/db/schema/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { userId } = await auth(); // ← await it
  if (!userId) return NextResponse.redirect(new URL("/sign-in", req.url), 303);

  await db
    .insert(userPlans)
    .values({ userId, planId: "free" })
    .onConflictDoUpdate({
      target: userPlans.userId,
      set: { planId: "free" },
    });

  return NextResponse.redirect(new URL("/collections", req.url), 303);
}
