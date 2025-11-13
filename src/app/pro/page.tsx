import "server-only";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { getUserPlan } from "@/lib/plans";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

/* client panels */
import DownloadsPanel from "@/components/pro/DownloadsPanel";
import AlertsForm from "@/components/pro/AlertsForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Alert = {
  id: string;
  game: string;
  card_id: string;
  source: string;
  rule_type: string;
  threshold: number;
  active: boolean;
  created_at: string;
};

async function getAlerts(userId: string) {
  const res = await db.execute<Alert>(sql`
    SELECT
      id,
      game,
      target_card_id AS card_id,
      source,
      rule_type,
      threshold,
      active,
      created_at
    FROM price_alerts
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `);

  return (res.rows ?? []) as Alert[];
}

export default async function ProPage() {
  const { userId } = await auth();
  if (!userId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-white">Pro</h1>
        <p className="text-white/80">Please sign in.</p>
      </div>
    );
  }

  const plan = await getUserPlan(userId);
  const isPro = (plan?.limits?.maxItems ?? 0) > 0;

  if (!isPro) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-white">Pro</h1>
        <p className="text-white/80">Upgrade to unlock downloads and alerts.</p>
        <Link href="/pricing" className="inline-block rounded bg-amber-500 px-4 py-2 text-white">
          See plans
        </Link>
      </div>
    );
  }

  const alerts = await getAlerts(userId);

  return (
    <section className="space-y-8">
      <h1 className="text-2xl font-bold text-white">Pro Dashboard</h1>

      {/* Downloads with game switcher (Pokémon / Yu-Gi-Oh! / MTG) */}
      <DownloadsPanel />

      {/* Alerts + card autocomplete */}
      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <h2 className="text-lg font-semibold text-white mb-3">Price Alerts</h2>
        <AlertsForm />

        <div className="mt-4 space-y-2">
          {alerts.length === 0 ? (
            <div className="text-white/70">No alerts yet.</div>
          ) : (
            alerts.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2"
              >
                <div className="text-white/90 text-sm">
                  <b>{a.game}</b> • {a.card_id} • {a.source} • {a.rule_type} $
                  {Number(a.threshold).toFixed(2)}
                </div>
                <button
                  className="text-sm text-red-300 hover:text-red-200"
                  onClick={async () => {
                    await fetch(`/api/pro/alerts?id=${a.id}`, { method: "DELETE", cache: "no-store" });
                    location.reload();
                  }}
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
