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
    maxItemsTotal: number | null; // null = unlimited
  };

  features: {
    amazonCtas: boolean;
    pricechartingTopLists: boolean; // “Top {category} by PriceCharting”
    trendsAndMovers: boolean; // trends, top gainers/losers
    csvExports: boolean; // downloadable price sheets / collection CSV
    insuranceReports: boolean; // collection valuation for insurance
    advancedLtvTools: boolean; // ROI tools, etc
  };
};

// canonical order for “at least Collector”, “at least Pro”, etc.
export const PLAN_ORDER: PlanId[] = ["free", "collector", "pro"];

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

/* ---------- DB glue ---------- */

type DbPlanRow = {
  plan_id: string | null;
};

/**
 * Ensure a user has a plan row. Safe to call repeatedly.
 * Call this on first login / post-auth / dashboard load if you want.
 */
export async function ensureUserPlanRow(userId: string) {
  if (!userId) return;

  try {
    await db.execute(sql`
      INSERT INTO public.user_plans (user_id, plan_id, updated_at)
      VALUES (${userId}, 'free', now())
      ON CONFLICT (user_id) DO NOTHING
    `);
  } catch (err) {
    console.error("[ensureUserPlanRow] failed", err);
  }
}

/**
 * Load user's plan. If missing/invalid/unavailable → returns Free.
 */
export async function getUserPlan(userId: string | null): Promise<Plan> {
  if (!userId) return PLANS.free;

  try {
    const res = await db.execute<DbPlanRow>(sql`
      SELECT plan_id
      FROM public.user_plans
      WHERE user_id = ${userId}
      LIMIT 1
    `);

    const raw = res.rows?.[0]?.plan_id ?? "free";
    const pid: PlanId =
      raw === "collector" || raw === "pro" || raw === "free" ? raw : "free";

    return PLANS[pid] ?? PLANS.free;
  } catch (err) {
    console.error("[getUserPlan] failed, defaulting to free", err);
    return PLANS.free;
  }
}

/* ---------- Plan hierarchy helpers ---------- */

export function planRank(id: PlanId): number {
  return PLAN_ORDER.indexOf(id);
}

export function isPlanAtLeast(current: PlanId, required: PlanId): boolean {
  return planRank(current) >= planRank(required);
}

/**
 * “Capabilities” object you can use in UI and backend.
 */
export function planCapabilities(plan: Plan) {
  return {
    // analytics
    canSeeBasicAnalytics: true,
    canSeeFullAnalytics: isPlanAtLeast(plan.id, "collector"),

    // feature flags
    canSeePricechartingTopLists: plan.features.pricechartingTopLists,
    canSeeTrendsAndMovers: plan.features.trendsAndMovers,
    canExportCsv: plan.features.csvExports,
    canGenerateInsuranceReport: plan.features.insuranceReports,
    canUseAdvancedLtvTools: plan.features.advancedLtvTools,

    // limits
    maxCollections: plan.limits.maxCollections,
    maxItemsTotal: plan.limits.maxItemsTotal,
  };
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

export function canAddCollection(plan: Plan, currentCollections: number): boolean {
  if (plan.limits.maxCollections == null) return true;
  return currentCollections < plan.limits.maxCollections;
}

export function canAddItem(plan: Plan, currentItems: number): boolean {
  if (plan.limits.maxItemsTotal == null) return true;
  return currentItems < plan.limits.maxItemsTotal;
}
