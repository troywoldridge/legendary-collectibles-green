// src/app/pro/page.tsx
import "server-only";

import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

import ProMoversCard from "./pro-movers-card";
import AlertsClient from "./alerts/AlertsClient";
import { getUserPlan } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function priceAlertsTableExists() {
  const r = await db.execute<{ exists: boolean }>(sql`
    SELECT to_regclass('public.price_alerts') IS NOT NULL AS exists
  `);
  return Boolean(r.rows?.[0]?.exists);
}

function DownloadLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      download
      className="rounded-md border px-3 py-2 text-sm hover:opacity-90"
    >
      {children}
    </a>
  );
}

export default async function ProPage() {
  const { userId } = await auth();

  if (!userId) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-2xl font-semibold">Pro Tools</h1>
        <p className="mt-3 opacity-80">Please sign in to use Pro tools.</p>
      </main>
    );
  }

  const plan = await getUserPlan(userId);

  // Gate the page itself
  if (plan.id !== "pro") {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Pro Tools</h1>
            <p className="mt-2 opacity-80">
              Exports, insurance reports, movers, and price alerts are Pro features.
            </p>
          </div>

          <Link href="/collection" className="rounded-md border px-3 py-2 text-sm hover:opacity-90" prefetch={false}>
            Back to Collection
          </Link>
        </div>

        <div className="mt-8 rounded-2xl border border-white/15 bg-white/5 p-5">
          <div className="text-lg font-semibold">Upgrade required</div>
          <p className="mt-2 text-sm text-white/70">
            Your current plan is <span className="font-medium text-white">{plan.name}</span>. Upgrade to Pro to unlock
            exports, insurance reports, movers, and price alerts.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/pricing" className="rounded-md border px-3 py-2 text-sm hover:opacity-90" prefetch={false}>
              View plans
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const alertsExists = await priceAlertsTableExists();

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Pro Tools</h1>
          <p className="mt-2 opacity-80">Movers, exports, and reports for serious collectors.</p>
        </div>

        <Link href="/collection" className="rounded-md border px-3 py-2 text-sm hover:opacity-90" prefetch={false}>
          Back to Collection
        </Link>
      </div>

      {/* Movers */}
      <section className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Movers</h2>
          <div className="flex gap-2">
            <Link href="/pro/movers" className="rounded-md border px-3 py-2 text-sm hover:opacity-90" prefetch={false}>
              Full movers page
            </Link>

            <DownloadLink href="/api/pro/exports/movers?days=7&limit=200&format=csv">
              Download CSV (7d)
            </DownloadLink>
          </div>
        </div>

        <div className="mt-4">
          <ProMoversCard days={7} limit={25} />
        </div>
      </section>

      {/* Exports */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold">Exports</h2>
        <p className="mt-2 opacity-80">Download your collection with live prices.</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <DownloadLink href="/api/exports/collection?game=all">Export Collection CSV (All)</DownloadLink>
          <DownloadLink href="/api/exports/collection?game=pokemon">Export Pokémon CSV</DownloadLink>
          <DownloadLink href="/api/exports/collection?game=mtg">Export MTG CSV</DownloadLink>
          <DownloadLink href="/api/exports/collection?game=yugioh">Export YGO CSV</DownloadLink>
        </div>
      </section>

      {/* Insurance */}
      <section className="mt-10">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Insurance Report</h2>
            <p className="mt-2 opacity-80">High-value items (defaults to $250+ total per line item).</p>
          </div>

          <DownloadLink href="/api/exports/insurance?threshold=250">Download Insurance CSV</DownloadLink>
        </div>
      </section>

      {/* Price Alerts */}
      <section className="mt-10 rounded-2xl border border-white/20 bg-black/40 p-4 backdrop-blur-sm">
        <div className="mb-3">
          <h2 className="text-lg font-semibold">Price Alerts</h2>
          <p className="text-xs text-white/60">Get notified when a card crosses a price you care about.</p>
        </div>

        {alertsExists ? (
          <AlertsClient />
        ) : (
          <div className="text-sm text-white/70">
            Alerts are not available yet (missing <code className="text-white">price_alerts</code> table).
          </div>
        )}
      </section>
    </main>
  );
}
