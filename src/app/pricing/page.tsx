// src/app/pricing/page.tsx
import "server-only";

import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { getUserPlan, PLANS, type PlanId } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLAN_ORDER: PlanId[] = ["free", "collector", "pro"];

function planFeatureList(planId: PlanId) {
  switch (planId) {
    case "free":
      return [
        "1 collection, up to 500 items",
        "Basic collection tracking",
        "Amazon buy buttons on card pages",
        "Save favorites & build a starter vault",
      ];
    case "collector":
      return [
        "Up to 5 collections, 5,000 items total",
        "PriceCharting-powered top cards by category",
        "Trends, gainers & losers dashboards",
        "Smart collection stats & insights",
        "Priority for future features like price alerts",
      ];
    case "pro":
      return [
        "Unlimited collections and items",
        "Downloadable price sheets & collection exports (CSV)",
        "Full collection valuation for insurance",
        "Advanced list / loyalty / ROI calculators",
        "Best for serious collectors, stores, and investors",
      ];
  }
}

function planCtaLabel(planId: PlanId, isCurrent: boolean) {
  if (isCurrent) return "Current plan";
  if (planId === "free") return "Start for free";
  if (planId === "collector") return "Upgrade to Collector";
  return "Upgrade to Pro Collector";
}

function planCtaHref(planId: PlanId, isCurrent: boolean) {
  if (isCurrent) {
    return "/account/billing"; // adjust if your billing page lives elsewhere
  }
  if (planId === "free") {
    return "/sign-up"; // or straight to app if already signed in
  }
  // Assumes your route accepts ?plan=collector|pro
  return `/api/billing/create-checkout-session?plan=${planId}`;
}

export default async function PricingPage() {
  const { userId } = await auth();
  const currentPlan = await getUserPlan(userId ?? null);

  return (
    <section className="mx-auto max-w-6xl space-y-10 px-4 py-10 text-white">
      {/* Hero */}
      <header className="text-center space-y-4">
        <p className="text-xs uppercase tracking-[0.25em] text-white/60">
          Legendary Collectibles
        </p>
        <h1 className="text-3xl md:text-4xl font-bold">
          Pick the plan that matches your collection.
        </h1>
        <p className="mx-auto max-w-2xl text-sm md:text-base text-white/70">
          Start free, then upgrade as your vault grows. All plans include access
          to Pokémon, Yu-Gi-Oh!, and Magic: The Gathering card data.
        </p>
      </header>

      {/* Plans grid */}
      <div className="grid gap-6 md:grid-cols-3">
        {PLAN_ORDER.map((pid) => {
          const plan = PLANS[pid];
          const features = planFeatureList(pid);
          const isCurrent = currentPlan.id === pid;
          const isHighlighted = pid === "collector";

          return (
            <div
              key={pid}
              className={[
                "relative flex flex-col rounded-2xl border bg-white/5 p-5 backdrop-blur-sm",
                isHighlighted
                  ? "border-sky-400/70 shadow-[0_0_40px_rgba(56,189,248,0.35)]"
                  : "border-white/15",
              ].join(" ")}
            >
              {plan.badge && (
                <div className="absolute right-4 top-4 rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/80">
                  {plan.badge}
                </div>
              )}

              <div className="mb-4">
                <h2 className="text-xl font-semibold">{plan.name}</h2>
                <p className="mt-1 text-sm text-white/70">
                  {plan.description}
                </p>
              </div>

              <div className="mb-4">
                <div className="text-2xl font-bold">{plan.priceLabel}</div>
                {pid !== "free" && (
                  <div className="text-xs text-white/60">
                    Billed monthly, cancel anytime.
                  </div>
                )}
              </div>

              {/* Limits */}
              <div className="mb-3 rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/80">
                <div>
                  Collections:{" "}
                  <span className="font-semibold">
                    {plan.limits.maxCollections == null
                      ? "Unlimited"
                      : plan.limits.maxCollections}
                  </span>
                </div>
                <div>
                  Items:{" "}
                  <span className="font-semibold">
                    {plan.limits.maxItemsTotal == null
                      ? "Unlimited"
                      : plan.limits.maxItemsTotal.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Features list */}
              <ul className="mb-5 space-y-2 text-sm text-white/80">
                {features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="mt-0.5 inline-block h-1.5 w-1.5 rounded-full bg-sky-400" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <div className="mt-auto">
                <Link
                  href={planCtaHref(pid, isCurrent)}
                  prefetch={false}
                  className={[
                    "inline-flex w-full items-center justify-center rounded-lg border px-3 py-2 text-sm font-semibold transition",
                    isCurrent
                      ? "cursor-default border-white/30 bg-white/10 text-white"
                      : isHighlighted
                      ? "border-sky-400/80 bg-sky-500/90 text-black hover:bg-sky-400"
                      : "border-white/30 bg-white/5 text-white hover:bg-white/15",
                  ].join(" ")}
                >
                  {planCtaLabel(pid, isCurrent)}
                </Link>

                {isCurrent && (
                  <p className="mt-1 text-center text-[11px] text-emerald-300">
                    You&apos;re on this plan.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <p className="text-center text-xs text-white/60">
        Need something more custom for a shop or large vault?{" "}
        <a
          href="mailto:support@legendary-collectibles.com"
          className="text-sky-300 underline"
        >
          Contact us
        </a>
        .
      </p>
    </section>
  );
}
