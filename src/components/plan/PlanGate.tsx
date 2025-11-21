"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { PlanId } from "@/lib/plans";

const PLAN_ORDER: Record<PlanId, number> = {
  free: 0,
  collector: 1,
  pro: 2,
};

type PlanGateProps = {
  planId: PlanId | null | undefined;
  minPlan: PlanId;
  title: string;
  description?: string;
  children: ReactNode;
};

export default function PlanGate({
  planId,
  minPlan,
  title,
  description,
  children,
}: PlanGateProps) {
  const current = PLAN_ORDER[planId ?? "free"];
  const required = PLAN_ORDER[minPlan];
  const allowed = current >= required;

  if (allowed) {
    return <>{children}</>;
  }

  const labelMap: Record<PlanId, string> = {
    free: "Free",
    collector: "Collector",
    pro: "Pro",
  };

  return (
    <div className="rounded-2xl border border-amber-400/40 bg-amber-500/5 p-5 text-sm text-amber-50">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-amber-50">{title}</h3>
          {description ? (
            <p className="mt-1 text-amber-100/80">{description}</p>
          ) : null}
          <p className="mt-2 text-xs text-amber-100/70">
            This feature requires at least{" "}
            <span className="font-semibold">{labelMap[minPlan]}</span>. You are
            currently on{" "}
            <span className="font-semibold">
              {labelMap[planId ?? "free"]}
            </span>
            .
          </p>
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:mt-0 sm:text-right">
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center rounded-md bg-amber-400 px-3 py-1.5 text-xs font-semibold text-slate-950 shadow-sm hover:bg-amber-300"
          >
            View plans &amp; upgrade
          </Link>
          <Link
            href="/account"
            className="text-xs text-amber-100/80 hover:text-amber-50"
          >
            Manage subscription →
          </Link>
        </div>
      </div>
    </div>
  );
}
