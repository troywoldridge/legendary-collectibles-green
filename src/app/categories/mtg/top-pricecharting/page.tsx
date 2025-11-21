// src/app/categories/mtg/top-pricecharting/page.tsx
import "server-only";

import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { getUserPlan } from "@/lib/plans";
import PlanGate from "@/components/plan/PlanGate";
import {
  getTopPricechartingCardPrices,
  type PricechartingCardPriceRow,
} from "@/lib/pricecharting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function MtgTopPricechartingPage() {
  const { userId } = await auth();
  const plan = await getUserPlan(userId ?? null);

  const rows: PricechartingCardPriceRow[] =
    await getTopPricechartingCardPrices({
      category: "mtg",
      limit: 100,
      orderBy: "graded_price_cents",
    });

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Top Magic: The Gathering Cards by PriceCharting
            </h1>
            <p className="text-sm text-white/70">
              Graded MTG heavy-hitters ranked by PriceCharting. Perfect for
              spotting high-end staples and grails.
            </p>
          </div>
          <Link
            href="/categories/mtg/cards"
            className="text-sm text-sky-300 hover:underline"
          >
            ← Back to MTG cards
          </Link>
        </div>
        <p className="text-xs text-white/60">
          Data is sourced from your PriceCharting imports and refreshed on your
          nightly sync.
        </p>
      </header>

      <PlanGate
        planId={plan.id}
        minPlan="collector"
        title="Unlock Top MTG leaderboard"
        description="Collector and Pro members get full access to the Top 100 Magic cards by graded PriceCharting value."
      >
        <div className="overflow-x-auto rounded-2xl border border-white/15 bg-white/5 p-4 text-xs md:text-sm text-white">
          <table className="min-w-full text-left">
            <thead className="border-b border-white/20 text-white/70">
              <tr>
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">Card</th>
                <th className="py-2 pr-3">Console / Set</th>
                <th className="py-2 pr-3 text-right">Graded</th>
                <th className="py-2 pr-3 text-right">Loose</th>
                <th className="py-2 pr-3 text-right">BGS 10</th>
                <th className="py-2 pr-3 text-right">CGC 10</th>
                <th className="py-2 pr-3 text-right">SGC 10</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const graded =
                  r.graded_price_cents != null
                    ? `$${(r.graded_price_cents / 100).toFixed(2)}`
                    : "—";
                const loose =
                  r.loose_price_cents != null
                    ? `$${(r.loose_price_cents / 100).toFixed(2)}`
                    : "—";
                const bgs =
                  r.bgs_10_price_cents != null
                    ? `$${(r.bgs_10_price_cents / 100).toFixed(2)}`
                    : "—";
                const cgc =
                  r.condition_17_price_cents != null
                    ? `$${(r.condition_17_price_cents / 100).toFixed(2)}`
                    : "—";
                const sgc =
                  r.condition_18_price_cents != null
                    ? `$${(r.condition_18_price_cents / 100).toFixed(2)}`
                    : "—";

                return (
                  <tr
                    key={`${r.category}-${r.pricecharting_id}`}
                    className="border-b border-white/10 last:border-0"
                  >
                    <td className="py-1.5 pr-3 text-white/70">{idx + 1}</td>
                    <td className="py-1.5 pr-3">
                      {r.product_name ?? r.pricecharting_id}
                    </td>
                    <td className="py-1.5 pr-3 text-white/70">
                      {r.console_name ?? "—"}
                    </td>
                    <td className="py-1.5 pr-3 text-right">{graded}</td>
                    <td className="py-1.5 pr-3 text-right text-white/80">
                      {loose}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-white/80">
                      {bgs}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-white/80">
                      {cgc}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-white/80">
                      {sgc}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </PlanGate>
    </section>
  );
}
