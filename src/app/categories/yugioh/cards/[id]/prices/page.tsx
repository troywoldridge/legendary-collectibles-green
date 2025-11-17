/* eslint-disable @typescript-eslint/no-unused-vars */

import "server-only";

import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

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

/* ====================================
   Types
==================================== */

type SearchParams = Record<string, string | string[] | undefined>;
type CardCore = { id: string; name: string | null };

type YgoHist = {
  captured_at: string;
  tcgplayer_price: string | null;
  cardmarket_price: string | null;
  ebay_price: string | null;
  amazon_price: string | null;
  coolstuffinc_price: string | null;
};

/* ====================================
   Helpers
==================================== */

function readDisplay(sp: SearchParams): DisplayCurrency {
  const a = Array.isArray(sp.display) ? sp.display[0] : sp.display;
  const b = Array.isArray(sp.currency) ? sp.currency[0] : sp.currency;
  const v = (a || b || "").toUpperCase();
  return v === "USD" || v === "EUR" ? (v as DisplayCurrency) : "NATIVE";
}

function withParam(baseHref: string, key: string, val: string) {
  const u = new URL(baseHref, "https://x/");
  u.searchParams.set(key, val);
  return u.pathname + (u.search ? u.search : "");
}

function asNum(v: string | null | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pickAtOrAfter<T extends { captured_at: string }>(
  rows: T[],
  sinceMs: number
) {
  const cutoff = Date.now() - sinceMs;
  for (const row of rows) {
    const t = Date.parse(row.captured_at);
    if (Number.isFinite(t) && t >= cutoff) return row;
  }
  return null;
}

function pctChange(from: number | null, to: number | null): string | null {
  if (from == null || to == null || from === 0) return null;
  const p = ((to - from) / from) * 100;
  return `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
}

/* ====================================
   DB Lookups
==================================== */

async function resolveCardId(param: string): Promise<string | null> {
  const like = `%${param.replace(/-/g, " ").trim()}%`;

  const row = (
    await db.execute<{ id: string }>(sql`
      SELECT card_id AS id
      FROM ygo_cards
      WHERE card_id = ${param}
         OR lower(card_id) = lower(${param})
         OR name ILIKE ${like}
      ORDER BY
        CASE
          WHEN card_id = ${param} THEN 0
          WHEN lower(card_id) = lower(${param}) THEN 1
          ELSE 2
        END,
        card_id ASC
      LIMIT 1
    `)
  ).rows[0];

  return row?.id ?? null;
}

async function loadCore(cardId: string) {
  return (
    await db.execute<CardCore>(sql`
      SELECT card_id AS id, name
      FROM ygo_cards
      WHERE card_id = ${cardId}
      LIMIT 1
    `)
  ).rows[0];
}

async function loadHistory(cardId: string, days = 90) {
  const hist = (
    await db.execute<YgoHist>(sql`
      SELECT *
      FROM ygo_card_prices_history
      WHERE card_id = ${cardId}
        AND captured_at >= now() - (${days} * INTERVAL '1 day')
      ORDER BY captured_at ASC
    `)
  ).rows;

  if (hist.length) return hist;

  // fallback to the static snapshot table
  const snap = (
    await db.execute<Omit<YgoHist, "captured_at">>(sql`
      SELECT *
      FROM ygo_card_prices
      WHERE card_id = ${cardId}
      LIMIT 1
    `)
  ).rows[0];

  if (!snap) return [];

  return [
    {
      captured_at: new Date().toISOString(),
      ...snap,
    },
  ];
}

/* ====================================
   Page Component
==================================== */

export default async function YugiohCardPricesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id: rawId } = await params;
  const sp = await searchParams;

  const display = readDisplay(sp);

  const cardParam = decodeURIComponent(rawId ?? "").trim();
  const cardId = (await resolveCardId(cardParam)) ?? cardParam;

  const [core, hist] = await Promise.all([
    loadCore(cardId),
    loadHistory(cardId),
  ]);

  if (!core) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold text-white">Card not found</h1>
        <p className="text-white/70 text-sm break-all">
          Lookup: <code>{cardParam}</code>
        </p>
      </section>
    );
  }

  const baseDetail = `/categories/yugioh/cards/${encodeURIComponent(
    core.id
  )}`;
  const baseHref = `${baseDetail}/prices`;

  /* ----------------------------------------------
     PRICECHARTING (DB)
  ---------------------------------------------- */

  const pcSnapshot = await getLatestPricechartingSnapshotsForCards({
    category: "yugioh",
    cardIds: [core.id],
  });

  const pc = pcSnapshot[core.id] ?? null;

  const pcTop = await getTopPricechartingCardPrices({
    category: "yugioh",
    limit: 20,
    orderBy: "graded_price_cents",
  });

  /* ----------------------------------------------
     BUILD TRENDS
  ---------------------------------------------- */

  const fx = getFx();
  const dayMs = 86400000;

  const latest = hist.at(-1) ?? null;
  const h7 = pickAtOrAfter(hist, 7 * dayMs);
  const h30 = pickAtOrAfter(hist, 30 * dayMs);

  function conv(n: number | null) {
    if (n == null) return null;
    if (display === "NATIVE") return n;
    const out = convert(n, "USD", display);
    return out ?? n;
  }

  const metrics: Array<{
    label: string;
    latest: string | null;
    d7: string | null;
    d30: string | null;
  }> = [];

  function addMetric(label: string, key: keyof YgoHist) {
    if (!latest) return;

    const L = conv(asNum(latest[key]));
    const A7 = h7 ? conv(asNum(h7[key])) : null;
    const A30 = h30 ? conv(asNum(h30[key])) : null;

    metrics.push({
      label,
      latest: L == null ? null : formatMoney(L, display === "NATIVE" ? "USD" : display),
      d7: pctChange(A7, L),
      d30: pctChange(A30, L),
    });
  }

  addMetric("TCGplayer", "tcgplayer_price");
  addMetric("Cardmarket", "cardmarket_price");
  addMetric("eBay", "ebay_price");
  addMetric("Amazon", "amazon_price");
  addMetric("CoolStuffInc", "coolstuffinc_price");

  const noHistory = metrics.every((m) => !m.latest);

  /* ====================================
     RENDER
  ==================================== */

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Prices: {core.name}</h1>
          <div className="text-sm text-white/70">
            Market snapshot + PriceCharting + trends
          </div>
        </div>

        {/* Display Toggle */}
        <div className="flex items-center gap-3">
          <div className="rounded-md border border-white/20 bg-white/10 p-1 text-sm text-white">
            <span className="px-2">Display:</span>

            <Link
              href={withParam(baseHref, "display", "NATIVE")}
              className={`px-2 py-1 rounded ${
                display === "NATIVE" ? "bg-white/20" : "hover:bg-white/10"
              }`}
            >
              Native
            </Link>

            <Link
              href={withParam(baseHref, "display", "USD")}
              className={`px-2 py-1 rounded ml-1 ${
                display === "USD" ? "bg-white/20" : "hover:bg-white/10"
              }`}
            >
              USD
            </Link>

            <Link
              href={withParam(baseHref, "display", "EUR")}
              className={`px-2 py-1 rounded ml-1 ${
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
          MARKET PRICES
      ---------------------------------------------------- */}
      <MarketPrices category="yugioh" cardId={core.id} display={display} />

      {/* ----------------------------------------------------
          PRICECHARTING — SNAPSHOT FOR THIS CARD
      ---------------------------------------------------- */}
      <div className="rounded-xl bg-white/5 border border-white/15 p-5 text-white">
        <h2 className="text-lg font-semibold mb-3">PriceCharting</h2>

        {pc ? (
          <div className="grid sm:grid-cols-3 grid-cols-2 gap-3 text-sm">
            <PcItem label="Loose" value={pc.loose_cents} />
            <PcItem label="Graded 9" value={pc.graded_cents} />
            <PcItem label="PSA 10" value={pc.manual_only_cents} />
            <PcItem label="CGC 10" value={pc.cgc10_cents} />
            <PcItem label="SGC 10" value={pc.sgc10_cents} />
            <PcItem
              label="Snapshot"
              value={pc.captured_at ? new Date(pc.captured_at).toLocaleDateString() : null}
              isDate
            />
          </div>
        ) : (
          <div className="text-white/70 text-sm">No PriceCharting snapshot available for this card.</div>
        )}
      </div>

      {/* ----------------------------------------------------
          PRICECHARTING — TOP YUGIOH (CSV)
      ---------------------------------------------------- */}
      <div className="rounded-xl bg-white/5 border border-white/15 p-5 text-white">
        <h2 className="text-lg font-semibold mb-3">
          Top Yu-Gi-Oh! (PriceCharting)
        </h2>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {pcTop.map((row) => (
            <div
              key={row.pricecharting_id}
              className="rounded-xl bg-white/5 border border-white/10 p-3 text-sm"
            >
              <div className="font-semibold">{row.product_name}</div>

              <div className="text-xs text-white/60">
                {row.console_name ?? "Yu-Gi-Oh!"}
                {row.release_date ? ` • ${row.release_date}` : ""}
              </div>

              <div className="mt-2 space-y-1 text-xs">
                <PcRow label="Loose" value={row.loose_price_cents} />
                <PcRow label="Graded 9" value={row.graded_price_cents} />
                <PcRow label="PSA 10" value={row.manual_only_price_cents} />
                <PcRow label="CGC 10" value={row.condition_17_price_cents} />
                <PcRow label="SGC 10" value={row.condition_18_price_cents} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ----------------------------------------------------
          TRENDS TABLE
      ---------------------------------------------------- */}
      <div className="rounded-xl bg-white/5 border border-white/15 p-5 text-white">
        <h2 className="text-lg font-semibold mb-2">Recent Trends</h2>

        {noHistory ? (
          <div className="text-white/70">No Recent Data.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-sm w-full">
              <thead>
                <tr className="text-white/70">
                  <th className="py-2 pr-3">Metric</th>
                  <th className="py-2 pr-3">Latest</th>
                  <th className="py-2 pr-3">7d</th>
                  <th className="py-2 pr-3">30d</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {metrics.map((m) => (
                  <tr key={m.label}>
                    <td className="py-2 pr-3">{m.label}</td>
                    <td className="py-2 pr-3">{m.latest ?? "—"}</td>
                    <td className="py-2 pr-3">{m.d7 ?? "—"}</td>
                    <td className="py-2 pr-3">{m.d30 ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

/* ====================================
   Small Components
==================================== */

function PcItem({
  label,
  value,
  isDate,
}: {
  label: string;
  value: number | string | null;
  isDate?: boolean;
}) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-md p-3">
      <div className="text-xs text-white/60">{label}</div>
      <div className="text-white font-semibold">
        {isDate
          ? value ?? "—"
          : typeof value === "number"
          ? centsToUsd(value)
          : "—"}
      </div>
    </div>
  );
}

function PcRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex justify-between">
      <span className="text-white/70">{label}:</span>
      <span className="text-white">{centsToUsd(value) ?? "—"}</span>
    </div>
  );
}
