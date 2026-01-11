import "server-only";

import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { site } from "@/config/site";


import MarketPrices from "@/components/MarketPrices";

import {
  type DisplayCurrency,
  convert,
  formatMoney,
  getFx,
} from "@/lib/pricing";

import {
  centsToUsd,
  getLatestPricechartingSnapshotsForCards,
  getTopPricechartingCardPrices,
} from "@/lib/pricecharting";

import { getUserPlan } from "@/lib/plans";
import PlanGate from "@/components/plan/PlanGate";




/* -----------------------------------------------
   Runtime Config
------------------------------------------------ */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* -----------------------------------------------
   Types
------------------------------------------------ */
type SearchParams = Record<string, string | string[] | undefined>;

type CardCore = {
  id: string;
  name: string | null;
};

type YgoHist = {
  captured_at: string;
  tcgplayer_price: string | null;
  cardmarket_price: string | null;
  ebay_price: string | null;
  amazon_price: string | null;
  coolstuffinc_price: string | null;
};

/* -----------------------------------------------
   Shared helpers
------------------------------------------------ */
function readDisplay(sp: SearchParams): DisplayCurrency {
  const a = (
    Array.isArray(sp?.display) ? sp.display[0] : sp?.display
  )?.toUpperCase();
  const b = (
    Array.isArray(sp?.currency) ? sp.currency[0] : sp?.currency
  )?.toUpperCase();
  const v = a || b;
  return v === "USD" || v === "EUR" ? (v as DisplayCurrency) : "NATIVE";
}

function withParam(baseHref: string, key: string, val: string) {
  const u = new URL(baseHref, "https://x/");
  u.searchParams.set(key, val);
  return u.pathname + (u.search ? u.search : "");
}

function asNum(v: string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pickAtOrAfter<T extends { captured_at: string }>(
  rows: T[],
  sinceMs: number,
) {
  const t0 = Date.now() - sinceMs;
  for (const r of rows) {
    const t = Date.parse(r.captured_at);
    if (Number.isFinite(t) && t >= t0) return r;
  }
  return null;
}

function pctChange(from: number | null, to: number | null): string | null {
  if (from == null || to == null || from === 0) return null;
  const p = ((to - from) / from) * 100;
  return `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
}

function absUrl(path: string) {
  const base = (site?.url ?? "https://legendary-collectibles.com").replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}


/* -----------------------------------------------
   YGO-specific loaders
------------------------------------------------ */

// Search in YGO cards
async function resolveCardId(param: string): Promise<string | null> {
  const trimmed = param.trim();
  if (!trimmed) return null;

  const like = `%${trimmed.replace(/-/g, " ").trim()}%`;

  const row =
    (
      await db.execute<{ id: string }>(sql`
        SELECT id
        FROM ygo_cards
        WHERE id = ${trimmed}
           OR lower(id) = lower(${trimmed})
           OR name ILIKE ${like}
        ORDER BY
          CASE
            WHEN id = ${trimmed} THEN 0
            WHEN lower(id) = lower(${trimmed}) THEN 1
            ELSE 2
          END,
          id ASC
        LIMIT 1
      `)
    ).rows?.[0] ?? null;

  return row?.id ?? null;
}

async function loadCore(cardId: string): Promise<CardCore | null> {
  return (
    (
      await db.execute<CardCore>(sql`
        SELECT id, name
        FROM ygo_cards
        WHERE id = ${cardId}
        LIMIT 1
      `)
    ).rows?.[0] ?? null
  );
}

// 90-day per-source price history for Yu-Gi-Oh!
async function loadHistory(cardId: string, days = 90): Promise<YgoHist[]> {
  const { rows } = await db.execute<YgoHist>(sql`
    SELECT
      captured_at,
      tcgplayer_price::text,
      cardmarket_price::text,
      ebay_price::text,
      amazon_price::text,
      coolstuffinc_price::text
    FROM ygo_card_prices_history
    WHERE card_id = ${cardId}
      AND captured_at >= now() - (${days} * INTERVAL '1 day')
    ORDER BY captured_at ASC
  `);

  return rows ?? [];
}

export async function generateMetadata(
  { params }: { params: { id: string } }
): Promise<Metadata> {
  const raw = decodeURIComponent(params.id ?? "").trim();
  if (!raw) {
    return {
      title: `Yu-Gi-Oh! Prices | ${site.name}`,
      description: `Track Yu-Gi-Oh! card prices, trends, and graded values on ${site.name}.`,
      robots: { index: true, follow: true },
    };
  }

  const resolvedId = await resolveCardId(raw);

  // If we can't resolve it, don't index the junk URL
  if (!resolvedId) {
    const canonical = absUrl(`/categories/yugioh/cards/${encodeURIComponent(raw)}/prices`);
    return {
      title: `Yu-Gi-Oh! Prices | ${site.name}`,
      description: `Track Yu-Gi-Oh! card prices, trends, and graded values on ${site.name}.`,
      alternates: { canonical },
      robots: { index: true, follow: true },
    };
  }

  // ✅ Canonical is always the clean ID, no query params
  const canonical = absUrl(
    `/categories/yugioh/cards/${encodeURIComponent(resolvedId)}/prices`
  );

  // Optional: pull name for better title/description (cheap query)
  const core = await loadCore(resolvedId);
  const name = core?.name ?? resolvedId;

  const title = `Prices: ${name} — Yu-Gi-Oh! Trends & Market | ${site.name}`;
  const description = `Live Yu-Gi-Oh! market prices + trends for ${name}. Includes PriceCharting graded values (Collector+) and source-level history (TCGplayer, Cardmarket, eBay, Amazon).`;

  return {
    title,
    description,
    alternates: { canonical },
  };
}


/* -----------------------------------------------
   Page Component
------------------------------------------------ */

export default async function YugiohCardPricesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id: rawId } = await params;
  const sp = await searchParams;
  const { userId } = await auth();
  const plan = await getUserPlan(userId ?? null);

  const display = readDisplay(sp);

  const cardParam = decodeURIComponent(rawId ?? "").trim();
  const resolvedId = (await resolveCardId(cardParam)) ?? cardParam;

  const [core, hist] = await Promise.all([
    loadCore(resolvedId),
    loadHistory(resolvedId, 90),
  ]);

  if (!core) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold text-white">Card not found</h1>
        <p className="mt-1 break-all text-sm text-white/70">
          Looked up: <code>{cardParam}</code>
        </p>
        <div className="flex gap-4">
          <Link
            href="/categories/yugioh/sets"
            className="text-sky-300 hover:underline"
          >
            ← Back to sets
          </Link>
          <Link href="/categories" className="text-sky-300 hover:underline">
            ← All categories
          </Link>
        </div>
      </section>
    );
  }

  const baseDetail = `/categories/yugioh/cards/${encodeURIComponent(core.id)}`;
  const baseHref = `${baseDetail}/prices`;

  /* ------------------------------
     PriceCharting (Database)
  ------------------------------ */

  const pcSnapshots = await getLatestPricechartingSnapshotsForCards({
    category: "yugioh",
    cardIds: [core.id],
  });

  const pcSnapshotsById = pcSnapshots ?? {};
const pc = pcSnapshotsById[core.id] ?? null;


  const pcTop = await getTopPricechartingCardPrices({
    category: "yugioh",
    limit: 20,
    orderBy: "graded_price_cents",
  });

  /* ------------------------------
     YGO Price History (per source)
  ------------------------------ */

  const fx = getFx();
  const dayMs = 24 * 3600 * 1000;

  const latest = hist.at(-1) ?? null;
  const h7 = pickAtOrAfter(hist, 7 * dayMs);
  const h30 = pickAtOrAfter(hist, 30 * dayMs);

  // All YGO history is in USD; we optionally convert to EUR
  function conv(n: number | null, src: "USD" | "EUR"): number | null {
    if (n == null) return null;
    if (display === "NATIVE") return n;
    const out = convert(n, src, display);
    return out == null ? n : out;
  }

  const metrics: Array<{
    label: string;
    latest: string | null;
    d7: string | null;
    d30: string | null;
  }> = [];

  // Helper to add a single source metric (TCGplayer / Cardmarket / etc)
  function addSourceMetric(
    label: string,
    latestRaw: string | null | undefined,
    h7Raw: string | null | undefined,
    h30Raw: string | null | undefined,
  ) {
    const latestNum = asNum(latestRaw);
    const v7 = asNum(h7Raw);
    const v30 = asNum(h30Raw);

    const latestConv = conv(latestNum, "USD");
    const v7Conv = conv(v7, "USD");
    const v30Conv = conv(v30, "USD");

    metrics.push({
      label,
      latest:
        latestConv == null
          ? null
          : formatMoney(
              latestConv,
              display === "NATIVE" ? "USD" : display,
            ),
      d7: pctChange(v7Conv, latestConv),
      d30: pctChange(v30Conv, latestConv),
    });
  }

  if (latest) {
    // Effective metric: YGOProDeck-first priority
    const effLatestNum = asNum(
      latest.tcgplayer_price ??
        latest.cardmarket_price ??
        latest.ebay_price ??
        latest.amazon_price ??
        latest.coolstuffinc_price,
    );
    const eff7Num = h7
      ? asNum(
          h7.tcgplayer_price ??
            h7.cardmarket_price ??
            h7.ebay_price ??
            h7.amazon_price ??
            h7.coolstuffinc_price,
        )
      : null;
    const eff30Num = h30
      ? asNum(
          h30.tcgplayer_price ??
            h30.cardmarket_price ??
            h30.ebay_price ??
            h30.amazon_price ??
            h30.coolstuffinc_price,
        )
      : null;

    const effLatestConv = conv(effLatestNum, "USD");
    const eff7Conv = conv(eff7Num, "USD");
    const eff30Conv = conv(eff30Num, "USD");

    if (effLatestConv != null) {
      metrics.push({
        label: "Effective (YGOProDeck-first)",
        latest: formatMoney(
          effLatestConv,
          display === "NATIVE" ? "USD" : display,
        ),
        d7: pctChange(eff7Conv, effLatestConv),
        d30: pctChange(eff30Conv, effLatestConv),
      });
    }

    // Individual sources
    addSourceMetric(
      "TCGplayer (YGOProDeck)",
      latest.tcgplayer_price,
      h7?.tcgplayer_price,
      h30?.tcgplayer_price,
    );
    addSourceMetric(
      "Cardmarket",
      latest.cardmarket_price,
      h7?.cardmarket_price,
      h30?.cardmarket_price,
    );
    addSourceMetric(
      "eBay",
      latest.ebay_price,
      h7?.ebay_price,
      h30?.ebay_price,
    );
    addSourceMetric(
      "Amazon",
      latest.amazon_price,
      h7?.amazon_price,
      h30?.amazon_price,
    );
    addSourceMetric(
      "CoolStuffInc",
      latest.coolstuffinc_price,
      h7?.coolstuffinc_price,
      h30?.coolstuffinc_price,
    );
  }

  const noHistoryOrValues =
    metrics.length === 0 || metrics.every((m) => !m.latest);

  /* -----------------------------------------------
     UI Render
  ------------------------------------------------ */

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Prices: {core.name ?? core.id}
          </h1>
          <div className="mt-1 text-sm text-white/80">
            Market snapshot + PriceCharting + source-level trends.
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="rounded-md border border-white/20 bg-white/10 p-1 text-sm text-white">
            <span className="px-2">Display:</span>
            <Link
              href={withParam(baseHref, "display", "NATIVE")}
              className={`rounded px-2 py-1 ${
                display === "NATIVE" ? "bg-white/20" : "hover:bg-white/10"
              }`}
            >
              Native
            </Link>
            <Link
              href={withParam(baseHref, "display", "USD")}
              className={`ml-1 rounded px-2 py-1 ${
                display === "USD" ? "bg-white/20" : "hover:bg-white/10"
              }`}
            >
              USD
            </Link>
            <Link
              href={withParam(baseHref, "display", "EUR")}
              className={`ml-1 rounded px-2 py-1 ${
                display === "EUR" ? "bg-white/20" : "hover:bg-white/10"
              }`}
            >
              EUR
            </Link>
          </div>

          <Link href={baseDetail} className="text-sky-300 hover:underline">
            ← Card detail
          </Link>
        </div>
      </div>

      {/* ----------------------------------------------------
          MARKET PRICES (TCGplayer + Cardmarket + etc.)
          Free+: everyone gets this snapshot
      ------------------------------------------------------ */}
      <MarketPrices category="yugioh" cardId={core.id} display={display} />

      {/* ----------------------------------------------------
          PRICECHARTING — Per-Card Snapshot (Collector+)
      ------------------------------------------------------ */}
      <PlanGate
        planId={plan.id}
        minPlan="collector"
        title="Unlock Yu-Gi-Oh! PriceCharting snapshot"
        description="Collector and Pro members see PriceCharting graded values (loose, graded, 10s) for each Yu-Gi-Oh! card."
      >
        <div className="rounded-xl border border-white/15 bg-white/5 p-5 text-white/90">
          <h2 className="mb-3 text-lg font-semibold text-white">
            PriceCharting (Graded Values)
          </h2>

          {pc ? (
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-md border border-white/10 bg-white/5 p-3">
                <div className="text-xs text-white/60">Loose (Ungraded)</div>
                <div className="font-semibold text-white">
                  {centsToUsd(pc.loose_cents) ?? "—"}
                </div>
              </div>

              <div className="rounded-md border border-white/10 bg-white/5 p-3">
                <div className="text-xs text-white/60">Graded 9</div>
                <div className="font-semibold text-white">
                  {centsToUsd(pc.graded_cents) ?? "—"}
                </div>
              </div>

              <div className="rounded-md border border-white/10 bg-white/5 p-3">
                <div className="text-xs text-white/60">PSA 10</div>
                <div className="font-semibold text-white">
                  {centsToUsd(pc.manual_only_cents) ?? "—"}
                </div>
              </div>

              <div className="rounded-md border border-white/10 bg-white/5 p-3">
                <div className="text-xs text-white/60">CGC 10</div>
                <div className="font-semibold text-white">
                  {centsToUsd(pc.cgc10_cents) ?? "—"}
                </div>
              </div>

              <div className="rounded-md border border-white/10 bg-white/5 p-3">
                <div className="text-xs text-white/60">SGC 10</div>
                <div className="font-semibold text-white">
                  {centsToUsd(pc.sgc10_cents) ?? "—"}
                </div>
              </div>

              <div className="rounded-md border border-white/10 bg-white/5 p-3">
                <div className="text-xs text-white/60">Snapshot</div>
                <div className="text-xs font-semibold text-white">
                  {pc.captured_at
                    ? new Date(pc.captured_at).toLocaleDateString()
                    : "—"}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-white/10 bg-white/5 p-3 text-sm text-white/80">
              No PriceCharting snapshot yet for this card.
            </div>
          )}
        </div>
      </PlanGate>

      {/* ----------------------------------------------------
          PRICECHARTING — TOP YGO (CSV Snapshot, Collector+)
      ------------------------------------------------------ */}
      <PlanGate
        planId={plan.id}
        minPlan="collector"
        title="Unlock Top Yu-Gi-Oh! leaderboard"
        description="Collector and Pro members see the top Yu-Gi-Oh! cards ranked by graded PriceCharting values."
      >
        <div className="rounded-xl border border-white/15 bg-white/5 p-5 text-white/90">
          <h2 className="mb-4 text-lg font-semibold text-white">
            Top Yu-Gi-Oh! Cards by PriceCharting (Graded Snapshot)
          </h2>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {pcTop.map((row) => (
              <div
                key={row.pricecharting_id}
                className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm"
              >
                <div className="font-semibold text-white">
                  {row.product_name}
                </div>
                <div className="text-xs text-white/60">
                  {row.console_name ?? "Yu-Gi-Oh! Card"}
                  {row.release_date ? ` • ${row.release_date}` : ""}
                </div>

                <div className="mt-3 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-white/70">Loose:</span>
                    <span className="text-white">
                      {centsToUsd(row.loose_price_cents) ?? "—"}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-white/70">Graded 9:</span>
                    <span className="text-white">
                      {centsToUsd(row.graded_price_cents) ?? "—"}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-white/70">PSA 10:</span>
                    <span className="text-white">
                      {centsToUsd(row.manual_only_price_cents) ?? "—"}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-white/70">CGC 10:</span>
                    <span className="text-white">
                      {centsToUsd(row.condition_17_price_cents) ?? "—"}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-white/70">SGC 10:</span>
                    <span className="text-white">
                      {centsToUsd(row.condition_18_price_cents) ?? "—"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </PlanGate>

      {/* ----------------------------------------------------
          EFFECTIVE PRICE HISTORY (Collector+)
          Now shows Effective + per-source rows
      ------------------------------------------------------ */}
      <PlanGate
        planId={plan.id}
        minPlan="collector"
        title="Unlock Yu-Gi-Oh! price trends"
        description="Collector and Pro members see 7-day and 30-day trend metrics from your Yu-Gi-Oh! price history (TCGplayer, Cardmarket, eBay, etc.)."
      >
        <div className="rounded-xl border border-white/15 bg-white/5 p-5 text-white/90">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Recent Trends</h2>
            <div className="text-xs text-white/60">
              {display === "NATIVE"
                ? "Native market currencies"
                : `Converted to ${display}${
                    fx.usdToEur || fx.eurToUsd
                      ? ""
                      : " (no FX set; fallback used)"
                  }`}
            </div>
          </div>

          {noHistoryOrValues ? (
            <div className="rounded-md border border-white/10 bg-white/5 p-3 text-sm text-white/80">
              Not enough history yet. Snapshots will populate after your daily
              Yu-Gi-Oh! pricing run and history snapshot.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-white/70">
                    <th className="py-2 pr-4">Metric</th>
                    <th className="py-2 pr-4">Latest</th>
                    <th className="py-2 pr-4">7d</th>
                    <th className="py-2 pr-4">30d</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {metrics.map((m) => (
                    <tr key={m.label}>
                      <td className="py-2 pr-4 text-white">{m.label}</td>
                      <td className="py-2 pr-4">{m.latest ?? "—"}</td>
                      <td className="py-2 pr-4">{m.d7 ?? "—"}</td>
                      <td className="py-2 pr-4">{m.d30 ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </PlanGate>
    </section>
  );
}
