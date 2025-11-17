// src/components/UpgradeGate.tsx
"use client";

import Link from "next/link";
import type { PlanId } from "@/lib/plans";

type UpgradeGateProps = {
  currentPlanId: PlanId;
  requiredPlanId: PlanId;
  featureName: string; // e.g. "PriceCharting Top 100", "CSV Exports"
  children?: React.ReactNode; // Optional: blurred content
};

const ORDER: PlanId[] = ["free", "collector", "pro"];

function isPlanAtLeast(current: PlanId, required: PlanId) {
  return ORDER.indexOf(current) >= ORDER.indexOf(required);
}

function requiredLabel(required: PlanId) {
  if (required === "collector") return "Collector";
  if (required === "pro") return "Pro Collector";
  return "Free";
}

export default function UpgradeGate({
  currentPlanId,
  requiredPlanId,
  featureName,
  children,
}: UpgradeGateProps) {
  const allowed = isPlanAtLeast(currentPlanId, requiredPlanId);

  if (allowed) {
    return <>{children}</>;
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-400/50 bg-amber-500/5 p-4 text-white">
      {children ? (
        <div className="pointer-events-none select-none blur-sm opacity-50">
          {children}
        </div>
      ) : null}

      <div className="pointer-events-auto absolute inset-0 flex items-center justify-center">
        <div className="max-w-md rounded-xl border border-white/20 bg-black/80 px-4 py-3 text-center shadow-xl">
          <div className="text-xs uppercase tracking-[0.18em] text-amber-300/90">
            Premium Feature
          </div>
          <h3 className="mt-1 text-sm font-semibold">
            Upgrade to {requiredLabel(requiredPlanId)} to unlock {featureName}.
          </h3>
          <p className="mt-1 text-xs text-white/70">
            Your current plan:{" "}
            <span className="font-semibold capitalize">{currentPlanId}</span>.
            This feature includes richer insights and is designed for active
            collectors.
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <Link
              href={`/pricing?from=${encodeURIComponent(featureName)}`}
              className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-300"
            >
              View plans
            </Link>
            <Link
              href="/pricing"
              className="rounded-lg border border-white/30 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
            >
              Learn more
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
