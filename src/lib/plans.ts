// src/lib/plans.ts
import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export type PlanId = "free" | "collector" | "pro";

export type Plan = {
  id: PlanId;
  name: string;
  badge?: string;
  priceLabel: string;
  priceMonthlyCents: number;
  description: string;

  limits: {
    maxCollections: number | null;
    maxItemsTotal: number | null;
  };

  features: {
    // Commerce / monetization
    amazonCtas: boolean;
    ebayCtas: boolean;
    affiliateLinks: boolean;

    // Lists / discovery
    pricechartingTopLists: boolean; // legacy
    tcgplayerTopLists: boolean; // current
    trendsAndMovers: boolean;

    // Pricing + alerts
    priceAlerts: boolean;
    liveMarketPricing: boolean;
    ebayCompsAndSnapshots: boolean;

    // Market value panel gating (NEW)
    marketValueRanges: boolean;      // Collector+
    marketValueConfidence: boolean;  // Pro

    // Reporting / exports
    csvExports: boolean;
    insuranceReports: boolean;

    // Analytics
    collectionValuations: boolean;
    advancedLtvTools: boolean;
  };
};

export const PLAN_ORDER: PlanId[] = ["free", "collector", "pro"];

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    badge: "Starter",
    priceLabel: "Free",
    priceMonthlyCents: 0,
    description: "Track a starter collection and try out Legendary Collectibles with no commitment.",
    limits: { maxCollections: 1, maxItemsTotal: 500 },
    features: {
      amazonCtas: true,
      ebayCtas: true,
      affiliateLinks: true,

      pricechartingTopLists: false,
      tcgplayerTopLists: false,
      trendsAndMovers: false,

      priceAlerts: false,
      liveMarketPricing: true,
      ebayCompsAndSnapshots: true,

      // Market value panel gating
      marketValueRanges: false,
      marketValueConfidence: false,

      csvExports: false,
      insuranceReports: false,

      collectionValuations: false,
      advancedLtvTools: false,
    },
  },

  collector: {
    id: "collector",
    name: "Collector",
    badge: "Most Popular",
    priceLabel: "$7.00 / month",
    priceMonthlyCents: 700,
    description: "For serious collectors who want trends, leaderboards, and deep pricing insights.",
    limits: { maxCollections: 5, maxItemsTotal: 5000 },
    features: {
      amazonCtas: true,
      ebayCtas: true,
      affiliateLinks: true,

      pricechartingTopLists: true,
      tcgplayerTopLists: true,
      trendsAndMovers: true,

      priceAlerts: false,
      liveMarketPricing: true,
      ebayCompsAndSnapshots: true,

      // Market value panel gating
      marketValueRanges: true,        // ✅ Collector+
      marketValueConfidence: false,   // 🔒 Pro

      csvExports: false,
      insuranceReports: false,

      collectionValuations: true,
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
      "For high-volume collectors, stores, and investors. Price alerts, live market pricing, eBay comps, exports, valuations, and pro-grade analytics.",
    limits: { maxCollections: null, maxItemsTotal: null },
    features: {
      amazonCtas: true,
      ebayCtas: true,
      affiliateLinks: true,

      pricechartingTopLists: true,
      tcgplayerTopLists: true,
      trendsAndMovers: true,

      priceAlerts: true,
      liveMarketPricing: true,
      ebayCompsAndSnapshots: true,

      // Market value panel gating
      marketValueRanges: true,
      marketValueConfidence: true,

      csvExports: true,
      insuranceReports: true,

      collectionValuations: true,
      advancedLtvTools: true,
    },
  },
};

/* ---------- DB glue ---------- */

type DbPlanRow = {
  plan_id: string | null;
};

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
    const pid: PlanId = raw === "collector" || raw === "pro" || raw === "free" ? raw : "free";
    return PLANS[pid] ?? PLANS.free;
  } catch (err) {
    console.error("[getUserPlan] failed, defaulting to free", err);
    return PLANS.free;
  }
}

/* ---------- Plan hierarchy helpers ---------- */

export function planRank(id: PlanId): number {
  const idx = PLAN_ORDER.indexOf(id);
  return idx >= 0 ? idx : 0;
}

export function isPlanAtLeast(current: PlanId, required: PlanId): boolean {
  return planRank(current) >= planRank(required);
}

/* ---------- Feature gating (single-source-of-truth) ---------- */

export function canSeeTopLists(plan: Plan): boolean {
  return plan.features.tcgplayerTopLists || plan.features.pricechartingTopLists;
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

export function canUsePriceAlerts(plan: Plan): boolean {
  return plan.features.priceAlerts;
}

export function canShowAmazonCtas(plan: Plan): boolean {
  return plan.features.amazonCtas;
}

export function canShowEbayCtas(plan: Plan): boolean {
  return plan.features.ebayCtas;
}

export function canUseAffiliateLinks(plan: Plan): boolean {
  return plan.features.affiliateLinks;
}

export function canSeeEbayComps(plan: Plan): boolean {
  return plan.features.ebayCompsAndSnapshots;
}

export function canSeeLiveMarketPricing(plan: Plan): boolean {
  return plan.features.liveMarketPricing;
}

export function canSeeCollectionValuations(plan: Plan): boolean {
  return plan.features.collectionValuations;
}

// ✅ NEW: Market Value Panel gates
export function canSeeMarketRanges(plan: Plan): boolean {
  return plan.features.marketValueRanges;
}

export function canSeeMarketConfidence(plan: Plan): boolean {
  return plan.features.marketValueConfidence;
}

/* ---------- Capabilities object (nice for UI) ---------- */

export function planCapabilities(plan: Plan) {
  return {
    // analytics tiers
    canSeeBasicAnalytics: true,
    canSeeFullAnalytics: isPlanAtLeast(plan.id, "collector"),

    // features
    canSeeTopLists: canSeeTopLists(plan),
    canSeeTrendsAndMovers: canSeeTrends(plan),
    canExportCsv: canExportCsv(plan),
    canGenerateInsuranceReport: canSeeInsuranceReports(plan),
    canUseAdvancedLtvTools: canUseAdvancedLtvTools(plan),
    canUsePriceAlerts: canUsePriceAlerts(plan),
    canShowAmazonCtas: canShowAmazonCtas(plan),
    canShowEbayCtas: canShowEbayCtas(plan),
    canUseAffiliateLinks: canUseAffiliateLinks(plan),
    canSeeEbayComps: canSeeEbayComps(plan),
    canSeeLiveMarketPricing: canSeeLiveMarketPricing(plan),
    canSeeCollectionValuations: canSeeCollectionValuations(plan),

    // ✅ market panel
    canSeeMarketRanges: canSeeMarketRanges(plan),
    canSeeMarketConfidence: canSeeMarketConfidence(plan),

    // limits
    maxCollections: plan.limits.maxCollections,
    maxItemsTotal: plan.limits.maxItemsTotal,
  };
}

/* ---------- Backwards-compatible export name ---------- */

export function canSeePricechartingTop(plan: Plan): boolean {
  return canSeeTopLists(plan);
}

/* ---------- Limits ---------- */

export function canAddCollection(plan: Plan, currentCollections: number): boolean {
  if (plan.limits.maxCollections == null) return true;
  return currentCollections < plan.limits.maxCollections;
}

export function canAddItem(plan: Plan, currentItems: number): boolean {
  if (plan.limits.maxItemsTotal == null) return true;
  return currentItems < plan.limits.maxItemsTotal;
}
