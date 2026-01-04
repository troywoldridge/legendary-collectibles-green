// src/app/collection/page.tsx
import "server-only";

import Link from "next/link";
import Image from "next/image";
import { auth } from "@clerk/nextjs/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  getUserPlan,
  canExportCsv,
  canSeeInsuranceReports,
  canSeeTrends,
} from "@/lib/plans";
import CollectionDashboardClient from "@/components/collection/CollectionDashboardClient";

import CollectionTableBody, {
  type CollectionItem,
} from "@/app/collection/CollectionTableBody";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function formatMoneyFromCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function formatGameLabel(game: string | null | undefined): string {
  switch (String(game ?? "").toLowerCase()) {
    case "pokemon":
      return "Pokémon";
    case "mtg":
    case "magic":
      return "Magic: The Gathering";
    case "yugioh":
    case "ygo":
      return "Yu-Gi-Oh!";
    default:
      return "Other / Unknown";
  }
}

function toNumber(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return 0;
}

function buildSparklinePath(
  values: number[],
  width = 120,
  height = 32,
  padX = 2,
  padY = 4,
): string | null {
  if (!values.length) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const n = values.length;

  return values
    .map((v, idx) => {
      const x =
        n === 1
          ? width / 2
          : padX + ((width - padX * 2) * idx) / (n - 1);
      const norm = (v - min) / span;
      const y = height - padY - norm * (height - padY * 2);
      return `${idx === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export default async function CollectionPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const { userId } = await auth();

  if (!userId) {
    return (
      <section className="p-8 text-white">
        <h1 className="text-2xl font-bold">You must sign in</h1>
        <p className="mt-2">
          <Link href="/sign-in" className="underline">
            Sign in
          </Link>{" "}
          to view your collection.
        </p>
      </section>
    );
  }

  const plan = await getUserPlan(userId);

  const isPro = plan.id === "pro";
  const isCollector = plan.id === "collector";
  const planLabel = isPro ? "Pro Collector" : isCollector ? "Collector" : "Free";

  const canCsv = canExportCsv(plan);
  const canInsurance = canSeeInsuranceReports(plan);
  const canMovers = canSeeTrends(plan);

  // ---- Filters from query string ----
  const sort = first(sp.sort) ?? "date";
  const game = first(sp.game) ?? "all";
  const setName = first(sp.set) ?? "all";
  const folder = first(sp.folder) ?? "all";
  const query = first(sp.q) ?? "";

  // ---- Main rows for current view ----
  const rowsRes = await db.execute<CollectionItem>(sql`
    SELECT
      id,
      game,
      card_id,
      card_name,
      set_name,
      image_url,
      grading_company,
      grade_label,
      cert_number,
      is_verified,
      verified_at,
      quantity,
      folder,
      cost_cents,
      last_value_cents,
      created_at
    FROM user_collection_items
    WHERE user_id = ${userId}
      AND (${game} = 'all' OR game = ${game})
      AND (${setName} = 'all' OR set_name = ${setName})
      AND (${folder} = 'all' OR folder = ${folder})
      AND (
        ${query} = ''
        OR card_name ILIKE '%' || ${query} || '%'
        OR set_name ILIKE '%' || ${query} || '%'
      )
    ORDER BY
      CASE WHEN ${sort} = 'date' THEN created_at END DESC NULLS LAST,
      CASE WHEN ${sort} = 'name' THEN card_name END ASC NULLS LAST,
      created_at DESC
  `);

  const items = rowsRes.rows ?? [];

  // Build dropdown options (safe + stable)
  const setOptions = Array.from(
    new Set(
      items
        .map((r) => r.set_name)
        .filter((v): v is string => Boolean(v && v.trim())),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const folderOptions = Array.from(
    new Set(
      items
        .map((r) => r.folder)
        .filter((v): v is string => Boolean(v && v.trim())),
    ),
  ).sort((a, b) => a.localeCompare(b));

  // Summary numbers
  const distinctItems = items.length;
  const totalCopies = items.reduce((sum, r) => sum + (r.quantity ?? 0), 0);

  const totalCostCents = items.reduce((sum, r) => {
    const qty = r.quantity ?? 0;
    const costEach = r.cost_cents ?? 0;
    return sum + qty * costEach;
  }, 0);

  const estValueCents = items.reduce((sum, r) => {
    const qty = r.quantity ?? 0;
    const valueEach = r.last_value_cents ?? 0;
    return sum + qty * valueEach;
  }, 0);

  const byGameMap = new Map<string, { copies: number; valueCents: number }>();

  for (const r of items) {
    const g = r.game ?? "other";
    const entry = byGameMap.get(g) ?? { copies: 0, valueCents: 0 };
    entry.copies += r.quantity ?? 0;
    entry.valueCents += (r.last_value_cents ?? 0) * (r.quantity ?? 0);
    byGameMap.set(g, entry);
  }

  const byGame = Array.from(byGameMap.entries()).map(([gameKey, data]) => ({
    game: gameKey,
    copies: data.copies,
    valueCents: data.valueCents,
  }));

  const hasValueData = items.some(
    (r) => r.last_value_cents != null && r.last_value_cents > 0,
  );

  const portfolioGainCents = estValueCents - totalCostCents;
  const portfolioGainPct =
    totalCostCents > 0 ? (portfolioGainCents / totalCostCents) * 100 : null;

  // Valuation sparkline history (never crashes the page)
  const historyRes = await db.execute<{
    as_of_date: string;
    total_value_cents: number | string | null;
  }>(sql`
    SELECT as_of_date, total_value_cents
    FROM user_collection_daily_valuations
    WHERE user_id = ${userId}
    ORDER BY as_of_date ASC
    LIMIT 60
  `);

  const historyRaw = historyRes.rows ?? [];
  const sparklinePoints = historyRaw
    .map((row) => ({
      date: row.as_of_date,
      value: toNumber(row.total_value_cents),
    }))
    .filter((p) => p.value > 0);

  const sparklinePath = buildSparklinePath(
    sparklinePoints.map((p) => p.value),
  );

  // Recently added
  const recentRes = await db.execute<CollectionItem>(sql`
    SELECT
      id,
      game,
      card_id,
      card_name,
      set_name,
      image_url,
      grading_company,
      grade_label,
      cert_number,
      is_verified,
      verified_at,
      quantity,
      folder,
      cost_cents,
      last_value_cents,
      created_at
    FROM user_collection_items
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 5
  `);
  const recent = recentRes.rows ?? [];

  return (
    <section className="mx-auto max-w-7xl space-y-6 p-4 text-white">
      {/* Header with plan + actions */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">My Collection</h1>
          <p className="mt-1 text-sm text-white/80">
            Manage your personal collection across Pokémon, Magic, and Yu-Gi-Oh!.
            Filters, summary, and analytics update live.
          </p>
          <p className="mt-1 text-sm text-white/70">
            View detailed charts and historical valuations on the{" "}
            <Link
              href="/collection/analytics"
              className="text-sky-300 hover:underline"
            >
              analytics page
            </Link>
            .
          </p>
        </div>

        <div className="flex flex-col items-start gap-2 sm:items-end">
          {/* Plan pill */}
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs">
            <span className="uppercase tracking-wide text-white/50">Plan</span>
            <span className="font-semibold text-white">{planLabel}</span>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link
              href="/collection/analytics"
              className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
            >
              View analytics
            </Link>

            {canCsv ? (
              <a
                href="/api/pro/exports/collection"
                className="rounded-lg border border-emerald-400/50 bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-50 hover:bg-emerald-500/30"
              >
                Download collection CSV
              </a>
            ) : (
              <Link
                href="/pricing"
                className="rounded-lg border border-amber-400/50 bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-50 hover:bg-amber-500/30"
              >
                Upgrade to Pro for CSV exports
              </Link>
            )}

            {(canCsv || canMovers || canInsurance) && (
              <Link
                href="/pro"
                className="rounded-lg border border-sky-400/40 bg-sky-500/15 px-3 py-1.5 text-xs font-medium text-sky-100 hover:bg-sky-500/25"
              >
                Pro tools
              </Link>
            )}

            {canMovers && (
              <>
                <Link
                  href="/pro/movers"
                  className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
                >
                  Movers
                </Link>
                <a
                  href="/api/pro/exports/movers?days=7&limit=200&format=csv"
                  className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
                >
                  Movers CSV (7d)
                </a>
              </>
            )}

            {canInsurance && (
              <a
                href="/api/pro/insurance?format=csv&threshold=250"
                className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
              >
                Insurance CSV
              </a>
            )}
          </div>
        </div>
      </header>

      <CollectionDashboardClient />

      {/* Analytics row */}
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-white/20 bg-black/40 px-4 py-3 backdrop-blur-sm">
          <div className="text-xs uppercase tracking-wide text-white/60">
            Distinct items
          </div>
          <div className="mt-1 text-2xl font-semibold">{distinctItems}</div>
          <div className="mt-1 text-[11px] text-white/60">
            Filtered by your current view.
          </div>
        </div>

        <div className="rounded-2xl border border-white/20 bg-black/40 px-4 py-3 backdrop-blur-sm">
          <div className="text-xs uppercase tracking-wide text-white/60">
            Total copies
          </div>
          <div className="mt-1 text-2xl font-semibold">{totalCopies}</div>
          <div className="mt-1 text-[11px] text-white/60">
            Sum of all quantities in this view.
          </div>
        </div>

        <div className="rounded-2xl border border-white/20 bg-black/40 px-4 py-3 backdrop-blur-sm">
          <div className="text-xs uppercase tracking-wide text-white/60">
            Est. collection value
          </div>
          <div className="mt-1 text-2xl font-semibold">
            {hasValueData ? formatMoneyFromCents(estValueCents) : "—"}
          </div>
          <div className="mt-1 text-[11px] text-white/60">
            Based on latest price × quantity.
          </div>

          {hasValueData && (
            <>
              <div className="mt-2 text-xs text-white/70">
                Cost basis: <span>{formatMoneyFromCents(totalCostCents)}</span>
                {portfolioGainPct != null && (
                  <span
                    className={
                      portfolioGainCents >= 0
                        ? "ml-2 text-emerald-300"
                        : "ml-2 text-red-300"
                    }
                  >
                    {portfolioGainCents >= 0 ? "▲" : "▼"}{" "}
                    {Math.abs(portfolioGainPct).toFixed(1)}%
                  </span>
                )}
              </div>

              <div className="mt-3 h-10">
                {sparklinePath ? (
                  <svg
                    viewBox="0 0 120 32"
                    className="h-full w-full text-emerald-300/80"
                    aria-hidden="true"
                  >
                    <path
                      d={sparklinePath}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <div className="text-[11px] text-white/50">
                    Run valuations on multiple days to see a trend.
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="rounded-2xl border border-white/20 bg-black/40 px-4 py-3 backdrop-blur-sm">
          <div className="flex items-center justify-between text-xs">
            <span className="uppercase tracking-wide text-white/60">
              By game (this view)
            </span>
          </div>
          <div className="mt-2 space-y-1.5">
            {byGame.length === 0 ? (
              <div className="text-xs text-white/60">
                No items yet. Add cards to see a breakdown.
              </div>
            ) : (
              byGame.map((g) => {
                const label = formatGameLabel(g.game);
                const totalForGame = byGame.reduce(
                  (sum, x) => sum + x.valueCents,
                  0,
                );
                const sharePct =
                  totalForGame > 0 ? (g.valueCents / totalForGame) * 100 : 0;

                return (
                  <div key={g.game} className="space-y-0.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span>{label}</span>
                      <span className="text-white/70">{g.copies}x</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-white/70"
                          style={{
                            width: `${Math.max(8, Math.min(100, sharePct || 0))}%`,
                          }}
                        />
                      </div>
                      <span className="text-[11px] text-white/70">
                        {formatMoneyFromCents(g.valueCents)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Recently added */}
      <div className="rounded-2xl border border-white/20 bg-black/40 p-4 backdrop-blur-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recently added</h2>
          <span className="text-xs text-white/60">
            {recent.length > 0
              ? "Most recent 5 items in your collection."
              : "Nothing added yet."}
          </span>
        </div>

        {recent.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/20 bg-black/40 p-4 text-sm text-white/70">
            When you add cards to your collection, they’ll show up here for quick
            access.
          </div>
        ) : (
          <ul className="divide-y divide-white/10">
            {recent.map((r) => {
              const dt = r.created_at != null ? new Date(r.created_at) : null;
              const when = dt ? dt.toLocaleDateString() : "";

              return (
                <li key={r.id} className="flex items-center gap-3 py-2">
                  <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded border border-white/20 bg-black/40">
                    {r.image_url ? (
                      <Image
                        src={r.image_url}
                        alt={r.card_name ?? "Card"}
                        fill
                        unoptimized
                        className="object-contain"
                        sizes="40px"
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-[10px] text-white/60">
                        No image
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="line-clamp-1 text-sm font-medium">
                      {r.card_name ?? r.card_id ?? "Unknown card"}
                    </div>
                    <div className="text-xs text-white/60">
                      {r.set_name ?? "—"} • {formatGameLabel(r.game)}
                    </div>
                  </div>
                  <div className="text-right text-xs text-white/60">
                    <div>{when}</div>
                    {r.quantity != null && <div>{r.quantity}x</div>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Filter bar */}
      <div className="rounded-2xl border border-white/20 bg-black/40 p-4 backdrop-blur-sm">
        <form className="flex flex-wrap items-center gap-3">
          <select
            name="sort"
            defaultValue={sort}
            className="rounded-md bg-white/10 px-3 py-2 text-sm"
          >
            <option value="date">Date Added</option>
            <option value="name">Name</option>
          </select>

          <select
            name="game"
            defaultValue={game}
            className="rounded-md bg-white/10 px-3 py-2 text-sm"
          >
            <option value="all">All Games</option>
            <option value="pokemon">Pokémon</option>
            <option value="mtg">Magic</option>
            <option value="yugioh">Yu-Gi-Oh!</option>
          </select>

          <select
            name="set"
            defaultValue={setName}
            className="rounded-md bg-white/10 px-3 py-2 text-sm"
          >
            <option value="all">All Sets</option>
            {setOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            name="folder"
            defaultValue={folder}
            className="rounded-md bg-white/10 px-3 py-2 text-sm"
          >
            <option value="all">All Folders</option>
            {folderOptions.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>

          <input
            type="text"
            name="q"
            placeholder="Search your collection…"
            defaultValue={query}
            className="flex-1 rounded-md bg-white/10 px-3 py-2 text-sm"
          />

          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-700"
          >
            Filter
          </button>
        </form>
      </div>

      {/* Table */}
      <div className="w-full overflow-x-auto rounded-2xl border border-white/20 bg-black/40 backdrop-blur-sm">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-white/10 text-left text-xs uppercase tracking-wide text-white/70">
            <tr>
              <th className="p-2">Photo</th>
              <th className="p-2">Item</th>
              <th className="p-2">Grade</th>
              <th className="p-2">Qty</th>
              <th className="p-2">Folder</th>
              <th className="p-2">Cost</th>
              <th className="p-2">Total Value</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>

          <CollectionTableBody items={items} />
        </table>
      </div>
    </section>
  );
}
