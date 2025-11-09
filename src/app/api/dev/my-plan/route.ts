// src/app/api/dev/my-plan/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { userPlans, billingCustomers } from "@/lib/db/schema/billing";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth(); // must await in your setup
  let planId: string | null = null;
  let stripeCustomerId: string | null = null;

  if (userId) {
    const planRows = await db
      .select({ planId: userPlans.planId })
      .from(userPlans)
      .where(eq(userPlans.userId, userId))
      .limit(1);
    planId = planRows[0]?.planId ?? null;

    const custRows = await db
      .select({ stripeCustomerId: billingCustomers.stripeCustomerId })
      .from(billingCustomers)
      .where(eq(billingCustomers.userId, userId))
      .limit(1);
    stripeCustomerId = custRows[0]?.stripeCustomerId ?? null;
  }

  return NextResponse.json({ userId: userId ?? null, planId, stripeCustomerId });
}
