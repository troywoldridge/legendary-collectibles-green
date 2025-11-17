// src/app/collection/insurance/page.tsx
import "server-only";

import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getUserPlan } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type ValRow = {
  as_of_date: string;
  total_quantity: number;
  distinct_items: number;
  total_cost_cents: string | null;
  total_value_cents: string | null;
};

function fmtMoney(cents: number | null | undefined): string {
  if (cents == null) return "—";
  const dollars = cents / 100;
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function InsuranceValuationPage() {
  const { userId } = await auth();
  if (!userId) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-6 text-white">
        <h1 className="text-2xl font-bold">
          Insurance valuation report (Pro)
        </h1>
        <p className="mt-2 text-sm text-white/80">
          <Link href="/sign-in" className="underline">
            Sign in
          </Link>{" "}
          to view your collection and generate insurance-ready reports.
        </p>
      </section>
    );
  }

  const plan = await getUserPlan(userId);
  const isPro = plan.id === "pro";

  // Load latest valuation snapshot
  const valRes = await db.execute<ValRow>(sql`
    SELECT
      as_of_date,
      total_quantity,
      distinct_items,
      total_cost_cents::text,
      total_value_cents::text
    FROM user_collection_daily_valuations
    WHERE user_id = ${userId}
    ORDER BY as_of_date DESC
    LIMIT 1
  `);

  const latest = valRes.rows?.[0] ?? null;
  const latestValueCents = latest
    ? Number(latest.total_value_cents ?? 0)
    : 0;
  const costCents = latest
    ? Number(latest.total_cost_cents ?? 0)
    : null;
  const unrealizedCents =
    costCents != null ? latestValueCents - costCents : null;

  return (
    <section className="mx-auto max-w-4xl px-4 py-6 text-white space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Insurance valuation report
          </h1>
          <p className="mt-1 text-sm text-white/80">
            Generate an insurance-ready snapshot of your collection&apos;s
            value for homeowners, renters, or specialized collectibles
            coverage.
          </p>
        </div>
        <Link
          href="/collection"
          className="text-sm text-sky-300 hover:underline"
        >
          ← Back to collection
        </Link>
      </header>

      {/* Plan gate for non-Pro */}
      {!isPro && (
        <div className="rounded-2xl border border-amber-400/60 bg-amber-500/15 p-4 text-sm text-amber-50">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide">
                Pro Collector feature
              </div>
              <p className="mt-1 text-amber-100/90">
                Insurance-level valuation PDFs are available on the{" "}
                <span className="font-semibold">Pro Collector</span>{" "}
                plan. You&apos;ll be able to download a formatted report
                showing total value, cost basis, and per-category
                breakdowns.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link
                href="/pricing"
                className="rounded-md bg-amber-400 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-300"
              >
                Upgrade to Pro Collector
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Summary card – visible to everyone with data, but copy shifts if not Pro */}
      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        {latest ? (
          <>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide text-white/60">
                  Latest portfolio valuation
                </div>
                <div className="mt-1 text-2xl font-semibold">
                  {fmtMoney(latestValueCents)}
                </div>
                <div className="mt-1 text-xs text-white/60">
                  As of {fmtDate(latest.as_of_date)} •{" "}
                  {latest.total_quantity} copies across{" "}
                  {latest.distinct_items} items
                </div>
              </div>
              <div className="space-y-1 text-right text-xs text-white/70">
                <div>
                  Cost basis:{" "}
                  <span className="font-medium">
                    {fmtMoney(costCents)}
                  </span>
                </div>
                <div>
                  Unrealized PnL:{" "}
                  <span
                    className={
                      unrealizedCents == null
                        ? "font-medium"
                        : unrealizedCents >= 0
                        ? "font-medium text-emerald-300"
                        : "font-medium text-red-300"
                    }
                  >
                    {fmtMoney(unrealizedCents)}
                  </span>
                </div>
              </div>
            </div>

            <p className="mt-3 text-xs text-white/70">
              The insurance report will lock in a snapshot of these
              values and format them into a PDF with collection totals,
              per-game breakdown, and supporting details that you can
              provide to your insurer.
            </p>
          </>
        ) : (
          <p className="text-sm text-white/80">
            We haven&apos;t recorded a valuation snapshot for your
            collection yet. Once your nightly valuation script runs at
            least once, this page will show your latest totals.
          </p>
        )}
      </div>

      {/* Download action – enabled only for Pro, but still visible for everyone */}
      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">
              Download insurance report
            </h2>
            <p className="mt-1 text-xs text-white/70">
              You&apos;ll receive a PDF summarizing your total collection
              value, cost basis, and category breakdown, suitable to
              attach to an insurance application or renewal.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <button
              type="button"
              disabled={!isPro || !latest}
              className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold ${
                !isPro || !latest
                  ? "cursor-not-allowed bg-white/10 text-white/50"
                  : "bg-emerald-500 text-black hover:bg-emerald-400"
              }`}
            >
              Download PDF (coming soon)
            </button>
            <div className="text-[11px] text-white/60">
              {isPro
                ? "PDF export wiring is next on the roadmap."
                : "Upgrade to Pro Collector to unlock insurance-ready PDF exports."}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
