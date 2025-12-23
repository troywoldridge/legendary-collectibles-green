import "server-only";

import Link from "next/link";
import Image from "next/image";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import { getUserPlan } from "@/lib/plans";
import CardSparkline from "@/components/collection/CardSparkline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type DailyValRow = {
  as_of_date: string; // date
  total_quantity: number;
  distinct_items: number;
  total_cost_cents: string | null;
  total_value_cents: string | null;
};

type GameBreakdownRow = {
  game: string | null;
  qty: number;
  value_cents: string | null;
};

type RecentItemRow = {
  id: string;
  game: string;
  card_id: string; // NOT NULL in DB
  card_name: string | null;
  set_name: string | null;
  image_url: string | null;
  quantity: number;
  last_value_cents: number | null;
  created_at: string;
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

function gameLabel(game: string | null | undefined): string {
  const g = (game ?? "").toLowerCase();
  if (g === "pokemon") return "Pokémon";
  if (g === "mtg" || g === "magic") return "Magic: The Gathering";
  if (g === "ygo" || g === "yugioh") return "Yu-Gi-Oh!";
  if (g === "sports") return "Sports";
  if (g === "funko") return "Funko Pop";
  return g || "Other";
}

function buildSparklinePoints(
  history: { valueCents: number }[],
  width = 260,
  height = 60,
): string {
  if (!history.length) return "";
  const values = history.map((p) => p.valueCents);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const n = history.length;

  return history
    .map((p, idx) => {
      const x = n === 1 ? width / 2 : (idx / (n - 1)) * width;
      const y = height - ((p.valueCents - min) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export default async function CollectionAnalyticsPage() {
  const { userId } = await auth();
  if (!userId) {
    return (
      <section className="max-w-4xl mx-auto p-6 text-white">
        <h1 className="text-2xl font-bold">Collection analytics</h1>
        <p className="mt-2">
          <Link href="/sign-in" className="underline">
            Sign in
          </Link>{" "}
          to view your portfolio analytics.
        </p>
      </section>
    );
  }

  const plan = await getUserPlan(userId);

  // ----- Load daily valuations -----
  const dailyRes = await db.execute<DailyValRow>(sql`
    SELECT
      as_of_date,
      total_quantity,
      distinct_items,
      total_cost_cents::text,
      total_value_cents::text
    FROM user_collection_daily_valuations
    WHERE user_id = ${userId}
    ORDER BY as_of_date ASC
  `);
  const daily = dailyRes.rows ?? [];

  const latest = daily[daily.length - 1];
  const prev = daily[daily.length - 2];

  const latestValueCents = latest ? Number(latest.total_value_cents ?? 0) : 0;
  const prevValueCents = prev ? Number(prev.total_value_cents ?? 0) : 0;
  const changeCents = latestValueCents - prevValueCents;
  const changePct =
    prevValueCents > 0 ? (changeCents / prevValueCents) * 100 : null;

  const costCents = latest ? Number(latest.total_cost_cents ?? 0) : null;
  const unrealizedCents = costCents != null ? latestValueCents - costCents : null;

  // History for portfolio chart
  const history = daily.map((d) => ({
    date: d.as_of_date,
    valueCents: Number(d.total_value_cents ?? 0),
  }));

  // ----- By game breakdown -----
  const gameRes = await db.execute<GameBreakdownRow>(sql`
    SELECT
      game,
      SUM(quantity)::integer AS qty,
      SUM(COALESCE(last_value_cents, 0) * quantity)::text AS value_cents
    FROM user_collection_items
    WHERE user_id = ${userId}
    GROUP BY game
    ORDER BY game ASC
  `);

  const byGame = (gameRes.rows ?? [])
    .map((r) => ({
      game: r.game,
      label: gameLabel(r.game),
      qty: Number(r.qty ?? 0),
      valueCents: r.value_cents != null ? Number(r.value_cents) : 0,
    }))
    .sort((a, b) => b.valueCents - a.valueCents);

  // ----- Recently added (include card_id for sparklines) -----
  const recentRes = await db.execute<RecentItemRow>(sql`
    SELECT
      id,
      game,
      card_id,
      card_name,
      set_name,
      image_url,
      quantity,
      last_value_cents,
      created_at
    FROM user_collection_items
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 5
  `);
  const recent = recentRes.rows ?? [];

  const isPro = plan.id === "pro";

  return (
    <section className="max-w-6xl mx-auto px-4 py-6 text-white space-y-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Collection analytics</h1>
          <p className="mt-1 text-sm text-white/80">
            Track your portfolio value, daily changes, and where your money is
            concentrated.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 sm:items-end">
          <Link href="/collection" className="text-sm text-sky-300 hover:underline">
            ← Back to collection
          </Link>

          {isPro ? (
            <a
              href="/api/collection/export"
              className="inline-flex items-center rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
            >
              Download collection CSV
            </a>
          ) : (
            <Link
              href="/pricing"
              className="inline-flex items-center rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-500/20"
            >
              Upgrade to Pro for CSV exports
            </Link>
          )}
        </div>
      </header>

      {/* --- Top summary cards --- */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Total value */}
        <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
          <div className="text-xs uppercase tracking-wide text-white/60">
            Portfolio value
          </div>
          <div className="mt-2 text-2xl font-semibold">{fmtMoney(latestValueCents)}</div>

          {latest && <div className="mt-1 text-xs text-white/60">As of {fmtDate(latest.as_of_date)}</div>}

          {changeCents !== 0 && (
            <div className={`mt-2 text-sm ${changeCents >= 0 ? "text-emerald-300" : "text-red-300"}`}>
              {changeCents >= 0 ? "+" : "-"}
              {fmtMoney(Math.abs(changeCents))}
              {changePct != null && (
                <span className="ml-1">
                  ({changePct >= 0 ? "+" : ""}
                  {changePct.toFixed(1)}%)
                </span>
              )}
            </div>
          )}

          {changeCents === 0 && daily.length > 1 && (
            <div className="mt-2 text-sm text-white/60">No change vs previous snapshot</div>
          )}

          {daily.length <= 1 && (
            <div className="mt-2 text-sm text-white/60">
              History will build up as your nightly revalue job runs.
            </div>
          )}
        </div>

        {/* Cost basis / PnL */}
        <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm space-y-2">
          <div className="text-xs uppercase tracking-wide text-white/60">Cost basis & PnL</div>

          <div className="flex flex-col gap-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-white/70">Total cost</span>
              <span className="font-medium">{fmtMoney(costCents)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/70">Unrealized PnL</span>
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

            {unrealizedCents != null && costCents && costCents > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-white/70">Return on cost</span>
                <span className="font-medium">{((unrealizedCents / costCents) * 100).toFixed(1)}%</span>
              </div>
            )}
          </div>

          {latest && (
            <div className="mt-2 text-xs text-white/60">
              Qty: {latest.total_quantity} • Items: {latest.distinct_items}
            </div>
          )}
        </div>

        {/* By game */}
        <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
          <div className="text-xs uppercase tracking-wide text-white/60">Breakdown by game</div>

          {byGame.length === 0 ? (
            <div className="mt-3 text-sm text-white/70">
              Add items to your collection to see a breakdown.
            </div>
          ) : (
            <dl className="mt-3 space-y-1.5 text-sm">
              {byGame.map((g) => (
                <div key={g.game ?? "other"} className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <dt className="font-medium">{g.label}</dt>
                    <dd className="text-xs text-white/60">
                      {g.qty} card{g.qty === 1 ? "" : "s"}
                    </dd>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{fmtMoney(g.valueCents)}</div>
                  </div>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>

      {/* --- Portfolio chart --- */}
      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-lg font-semibold text-white">Portfolio value over time</h2>
            <p className="text-xs text-white/70">
              Based on daily snapshots from the revalue script.
            </p>
          </div>
          <div className="text-xs text-white/60">
            {history.length > 1
              ? `${history.length} day${history.length === 1 ? "" : "s"}`
              : "Waiting for more history"}
          </div>
        </div>

        {history.length === 0 ? (
          <div className="rounded-md border border-white/10 bg-white/5 p-3 text-sm text-white/80">
            No history yet. Keep your nightly revalue job running and this chart will populate automatically.
          </div>
        ) : (
          <div className="mt-3 h-40 w-full">
            <svg viewBox="0 0 260 120" className="h-full w-full text-emerald-300">
              <line
                x1="0"
                y1="119"
                x2="260"
                y2="119"
                stroke="currentColor"
                strokeWidth="0.5"
                className="text-white/20"
              />
              <polyline
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                points={buildSparklinePoints(history, 260, 100)}
              />
            </svg>
          </div>
        )}
      </div>

      {/* --- Recently added --- */}
      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-white">Recently added</h2>
          <Link href="/collection" className="text-xs text-sky-300 hover:underline">
            View full collection
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="text-sm text-white/80">You haven&apos;t added anything yet.</div>
        ) : (
          <ul className="divide-y divide-white/10">
            {recent.map((r) => {
              const valueCents =
                r.last_value_cents != null ? r.last_value_cents * r.quantity : null;

              return (
                <li key={r.id} className="flex items-center gap-3 py-2">
                  <div className="relative h-12 w-9 shrink-0 overflow-hidden rounded border border-white/20 bg-black/40">
                    {r.image_url ? (
                      <Image
                        src={r.image_url}
                        alt={r.card_name ?? "Card"}
                        fill
                        unoptimized
                        className="object-contain"
                        sizes="36px"
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-[10px] text-white/40">
                        No image
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate">
                        <div className="truncate text-sm font-medium">
                          {r.card_name ?? "Unnamed card"}
                        </div>
                        <div className="truncate text-xs text-white/60">
                          {gameLabel(r.game)} {r.set_name ? `• ${r.set_name}` : ""}
                        </div>

                        {/* Per-card sparkline (requires card_id) */}
                        <CardSparkline cardId={r.card_id} game={r.game} />
                      </div>

                      <div className="text-right text-xs text-white/60">
                        {fmtDate(r.created_at)}
                      </div>
                    </div>

                    <div className="mt-1 flex items-center justify-between text-xs text-white/70">
                      <span>Qty: {r.quantity}</span>
                      <span>{valueCents != null ? fmtMoney(valueCents) : "—"}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}