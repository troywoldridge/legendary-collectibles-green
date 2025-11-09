// src/lib/plans.ts
import "server-only";
import { db } from "@/lib/db";
import { plans, userPlans, userSubscriptions } from "@/lib/db/schema/billing";
import { eq, desc } from "drizzle-orm";

export type PlanId = "free" | "collector" | "pro";
export type PlanLimits = {
  maxCollections: number | null;
  maxItems: number | null;
  // add more as your plans JSON includes them
  priceAlerts?: number | null;
  wantlist?: boolean | null;
  dailyValuation?: boolean | null;
  pdfReports?: boolean | null;
};

const FALLBACK_PLAN: PlanId = "free";

/** Determine the user’s effective plan (active subscription > stored plan > free). */
export async function getUserPlan(userId: string): Promise<{
  planId: PlanId;
  limits: PlanLimits;
}> {
  // Prefer an active subscription if you use subscriptions
  const subRow = (
    await db
      .select({
        planId: userSubscriptions.planId,
        status: userSubscriptions.status,
        // comment out if you don't have createdAt in this table
        // createdAt: userSubscriptions.createdAt,
      })
      .from(userSubscriptions)
      .where(eq(userSubscriptions.userId, userId))
      // .orderBy(desc(userSubscriptions.createdAt))
      .limit(1)
  )[0];

  let effective: PlanId | null = null;

  if (subRow?.status === "active") {
    effective = subRow.planId as PlanId;
  } else {
    // Fallback to simple mapping table
    const up = (
      await db
        .select({ planId: userPlans.planId })
        .from(userPlans)
        .where(eq(userPlans.userId, userId))
        .limit(1)
    )[0];
    effective = (up?.planId as PlanId | null) ?? null;
  }

  const planId: PlanId = effective ?? FALLBACK_PLAN;

  const plan = (
    await db
      .select({ limits: plans.limits })
      .from(plans)
      .where(eq(plans.id, planId))
      .limit(1)
  )[0];

  const limits: PlanLimits =
    plan?.limits ?? ({ maxCollections: 0, maxItems: 0 } as PlanLimits);

  return { planId, limits };
}

/** Typed error for quota enforcement. */
export class LimitError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.name = "LimitError";
    this.status = status;
  }
}

/** Throw when the user has hit a plan limit. */
export function assertLimit(
  current: number,
  maybeMax: number | null | undefined,
  label: string
) {
  if (maybeMax == null) return; // unlimited
  if (current >= maybeMax) {
    throw new LimitError(
      `${label} limit reached (${current}/${maybeMax}). Upgrade for more.`,
      403
    );
  }
}
