// src/app/pricing/success/page.tsx
import "server-only";
import Link from "next/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

function toPlanLabel(plan?: string): string {
  switch (plan) {
    case "collector":
      return "Collector";
    case "collector_plus":
    case "collector-plus":
      return "Collector +";
    case "pro":
      return "Pro";
    default:
      return "your new";
  }
}

export default function PricingSuccess({
  searchParams,
}: {
  searchParams: SP;
}) {
  const planParam = typeof searchParams.plan === "string" ? searchParams.plan : undefined;
  const planLabel = toPlanLabel(planParam);

  return (
    <section className="mx-auto max-w-lg px-4 py-16">
      <div className="rounded-2xl border border-white/15 bg-gradient-to-b from-white/10 to-white/[0.03] p-6 text-white shadow-lg shadow-black/30">
        {/* Icon + title */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/90">
            <span className="text-xl">✓</span>
          </div>
          <div>
            <h1 className="text-xl font-semibold">Thanks for upgrading! 🎉</h1>
            <p className="mt-1 text-sm text-white/70">
              Your {planLabel} subscription is now active.
            </p>
          </div>
        </div>

        {/* Body copy */}
        <p className="mt-6 text-sm text-white/75">
          You’ll get an email receipt shortly. You can manage your subscription
          and billing details from your account page at any time.
        </p>

        {/* Callouts */}
        <div className="mt-6 grid gap-3 rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/75">
          <div className="flex items-start gap-2">
            <span className="mt-[2px] text-xs">•</span>
            <span>New features and limits are available the next time you view your account.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-[2px] text-xs">•</span>
            <span>You can downgrade or cancel anytime from your account settings.</span>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/post-auth"
            className="inline-flex flex-1 items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Continue
          </Link>
          <Link
            href="/pricing"
            className="inline-flex flex-1 items-center justify-center rounded-md border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
          >
            Back to pricing
          </Link>
        </div>
      </div>
    </section>
  );
}
