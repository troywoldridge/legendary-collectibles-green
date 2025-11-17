// src/lib/plans.ts
import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export type PlanId = "free" | "collector" | "pro";

export type Plan = {
  id: PlanId;
  name: string;
  badge?: string;
  priceLabel: string; // "Free", "$7/mo", "$29.99/mo"
  priceMonthlyCents: number; // 0, 700, 2999
  description: string;

  limits: {
    maxCollections: number | null; // null = unlimited
    maxItemsTotal: number | null;  // null = unlimited
  };

  features: {
    amazonCtas: boolean;
    pricechartingTopLists: boolean;   // “Top {category} by PriceCharting”
    trendsAndMovers: boolean;         // trends, top gainers/losers
    csvExports: boolean;              // downloadable price sheets / collection CSV
    insuranceReports: boolean;        // collection valuation for insurance
    advancedLtvTools: boolean;        // “list / loy automated calculator”, ROI tools
  };
};

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    badge: "Starter",
    priceLabel: "Free",
    priceMonthlyCents: 0,
    description:
      "Track a starter collection and try out Legendary Collectibles with no commitment.",
    limits: {
      maxCollections: 1,
      maxItemsTotal: 500,
    },
    features: {
      amazonCtas: true,
      pricechartingTopLists: false,
      trendsAndMovers: false,
      csvExports: false,
      insuranceReports: false,
      advancedLtvTools: false,
    },
  },
  collector: {
    id: "collector",
    name: "Collector",
    badge: "Most Popular",
    priceLabel: "$7 / month",
    priceMonthlyCents: 700,
    description:
      "For serious collectors who want trends, leaderboards, and deep PriceCharting insights.",
    limits: {
      maxCollections: 5,
      maxItemsTotal: 5000,
    },
    features: {
      amazonCtas: true,
      pricechartingTopLists: true,
      trendsAndMovers: true,
      csvExports: false,
      insuranceReports: false,
      advancedLtvTools: false,
    },
  },
  pro: {
    id: "pro",
    name: "Pro Collector",
    badge: "For Power Users",
    priceLabel: "$29.99 / month",
    priceMonthlyCents: 2999,
    description:
      "High-volume collectors, stores, and investors. Full exports, valuations, and advanced tools.",
    limits: {
      maxCollections: null,
      maxItemsTotal: null,
    },
    features: {
      amazonCtas: true,
      pricechartingTopLists: true,
      trendsAndMovers: true,
      csvExports: true,
      insuranceReports: true,
      advancedLtvTools: true,
    },
  },
};

/* ---------- DB glue: get user plan from subscriptions ---------- */

type DbPlanRow = {
  plan_id: PlanId | null;
};

// You may already have a subscription table with a different schema.
// Adjust the SQL if needed.
export async function getUserPlan(userId: string | null): Promise<Plan> {
  if (!userId) {
    return PLANS.free;
  }

  // Example: a `user_plans` view or table:
  //   user_id (text, pk)
  //   plan_id ("free" | "collector" | "pro")
  const res = await db.execute<DbPlanRow>(sql`
    SELECT plan_id
    FROM user_plans
    WHERE user_id = ${userId}
    LIMIT 1
  `);

  const pid = res.rows?.[0]?.plan_id ?? "free";
  return PLANS[pid] ?? PLANS.free;
}

/* ---------- Simple helpers for gating ---------- */

export function canSeePricechartingTop(plan: Plan): boolean {
  return plan.features.pricechartingTopLists;
}

export function canSeeTrends(plan: Plan): boolean {
  return plan.features.trendsAndMovers;
}

export function canExportCsv(plan: Plan): boolean {
  return plan.features.csvExports;
}

export function canSeeInsuranceReports(plan: Plan): boolean {
  return plan.features.insuranceReports;
}

export function canUseAdvancedLtvTools(plan: Plan): boolean {
  return plan.features.advancedLtvTools;
}

export function canAddCollection(
  plan: Plan,
  currentCollections: number,
): boolean {
  if (plan.limits.maxCollections == null) return true;
  return currentCollections < plan.limits.maxCollections;
}

export function canAddItem(
  plan: Plan,
  currentItems: number,
): boolean {
  if (plan.limits.maxItemsTotal == null) return true;
  return currentItems < plan.limits.maxItemsTotal;
}
