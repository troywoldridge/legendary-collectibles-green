// src/components/account/PlanBenefits.tsx
import "server-only";

import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { getUserPlan, type PlanId, PLANS, PLAN_ORDER } from "@/lib/plans";

export const runtime = "nodejs";

const LABEL: Record<PlanId, string> = {
  free: "Free",
  collector: "Collector",
  pro: "Pro Collector",
};

const PRICE: Record<PlanId, string> = {
  free: "$0 / month",
  collector: "$7 / month",
  pro: "$29.99 / month",
};

const TAGLINE: Record<PlanId, string> = {
  free: "Get started with one collection.",
  collector: "Serious hobbyist tools + trends.",
  pro: "Full portfolio, exports, and insurance-ready.",
};

const FEATURES: Record<PlanId, string[]> = {
  free: [
    "1 collection",
    "Up to 500 items total",
    "Amazon buy buttons",
    "Basic collection dashboard",
    "No trends or leaderboards",
    "No CSV exports or reports",
  ],
  collector: [
    "Everything in Free",
    "Up to 5 collections",
    "Up to 5,000 items total",
    "Access to trends & category movers",
    "PriceCharting Top 100 views",
    "Basic insights & analytics",
    "Monthly portfolio summary email (planned)",
    "Weekly top movers email (planned)",
    "Price alerts for up to 5 cards (planned)",
  ],
  pro: [
    "Everything in Collector",
    "Unlimited collections",
    "Unlimited items",
    "CSV exports of your full collection",
    "Insurance-level valuation reports (in progress)",
    "Advanced “Loyalty / Break-even” calculators (planned)",
    "Bulk upload tools (planned)",
    "Deeper eBay integration (planned)",
    "AI grading assistance (future)",
    "Selling toolkit (future)",
  ],
};

export default async function PlanBenefits() {
  const { userId } = await auth();
  const plan = userId ? await getUserPlan(userId) : PLANS.free;
  const currentId = plan.id as PlanId;

  return (
    <section className="rounded-2xl border border-white/15 bg-white/5 p-4 text-white backdrop-blur-sm">
      <header className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Membership & benefits</h2>
          <p className="text-sm text-white/70">
            Compare plans and see what you unlock by upgrading.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-emerald-400/50 bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-100">
            Current plan: {LABEL[currentId]}
          </span>
          <Link
            href="/pricing"
            className="rounded-md bg-sky-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-sky-400"
          >
            View / change plan
          </Link>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        {PLAN_ORDER.map((id) => {
          const isCurrent = id === currentId;
          return (
            <div
              key={id}
              className={`flex flex-col rounded-xl border bg-white/5 p-3 text-sm ${
                isCurrent
                  ? "border-emerald-400/70 shadow-[0_0_0_1px_rgba(16,185,129,0.5)]"
                  : "border-white/15"
              }`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs uppercase tracking-wide text-white/60">
                    {LABEL[id]}
                  </div>
                  <div className="text-base font-semibold">{PRICE[id]}</div>
                </div>
                {isCurrent && (
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                    Current
                  </span>
                )}
              </div>
              <p className="mb-2 text-xs text-white/70">{TAGLINE[id]}</p>
              <ul className="mt-1 space-y-1 text-xs text-white/80">
                {FEATURES[id].map((f) => (
                  <li key={f} className="flex items-start gap-1.5">
                    <span className="mt-[3px] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-white/60" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] text-white/50">
        Some items are marked as “planned” or “future” — they&apos;ll roll
        out progressively, starting with Pro Collector.
      </p>
    </section>
  );
}
