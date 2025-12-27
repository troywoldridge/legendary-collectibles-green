import "server-only";

import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

import MarketPrices from "@/components/MarketPrices";
import { type DisplayCurrency, convert, formatMoney, getFx } from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type CardCore = {
  id: string;
  name: string | null;
  small_image: string | null;
  large_image: string | null;
};

type TcgHist = {
  captured_at: string;
  currency: string | null;
  normal: string | null;
  holofoil: string | null;
  reverse_holofoil: string | null;
};

type CmHist = {
  captured_at: string;
  trend_price: string | null;
  average_sell_price: string | null;
  low_price: string | null;
  suggested_price: string | null;
};

function readDisplay(sp: SearchParams): DisplayCurrency {
  const a = (Array.isArray(sp?.display) ? sp.display[0] : sp?.display) ?? "";
  const b = (Array.isArray(sp?.currency) ? sp.currency[0] : sp?.currency) ?? "";
  const v = (a || b).toUpperCase();
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

function pickAtOrAfter<T extends { captured_at: string }>(rows: T[], sinceMs: number) {
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

async function resolveCardId(param: string): Promise<string | null> {
  const like = `%${param.replace(/-/g, " ").trim()}%`;

  const row =
    (
      await db.execute<{ id: string }>(sql`
        SELECT id
        FROM public.tcg_cards
        WHERE id = ${param}
           OR lower(id) = lower(${param})
           OR name ILIKE ${like}
        ORDER BY
          CASE
            WHEN id = ${param} THEN 0
            WHEN lower(id) = lower(${param}) THEN 1
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
        SELECT id, name, small_image, large_image
        FROM public.tcg_cards
        WHERE id = ${cardId}
        LIMIT 1
      `)
    ).rows?.[0] ?? null
  );
}

async function loadHistory(cardId: string, days = 90) {
  const tcg =
    (
      await db.execute<TcgHist>(sql`
        SELECT captured_at, currency, normal, holofoil, reverse_holofoil
        FROM public.tcg_card_prices_tcgplayer_history
        WHERE card_id = ${cardId}
          AND captured_at >= now() - (${days} * INTERVAL '1 day')
        ORDER BY captured_at ASC
      `)
    ).rows ?? [];

  const cm =
    (
      await db.execute<CmHist>(sql`
        SELECT captured_at, trend_price, average_sell_price, low_price, suggested_price
        FROM public.tcg_card_prices_cardmarket_history
        WHERE card_id = ${cardId}
          AND captured_at >= now() - (${days} * INTERVAL '1 day')
        ORDER BY captured_at ASC
      `)
    ).rows ?? [];

  return { tcg, cm };
}

export default async function PokemonCardPricesPage({
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

  const [core, hist] = await Promise.all([loadCore(cardId), loadHistory(cardId)]);

  if (!core) {
    return (
      <section className="space-y-6">
        <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
          <h1 className="text-2xl font-bold text-white">Card not found</h1>
          <p className="mt-2 break-all text-sm text-white/70">
            Looked up: <code>{cardParam}</code>
          </p>
          <Link href="/categories/pokemon/cards" className="mt-4 inline-block text-sky-300 hover:underline">
            ← Back to cards
          </Link>
        </div>
      </section>
    );
  }

  const baseDetail = `/categories/pokemon/cards/${encodeURIComponent(core.id)}`;
  const baseHref = `${baseDetail}/prices`;

  const fx = getFx();

  const tcgLatest = hist.tcg.at(-1) ?? null;
  const tcg7 = pickAtOrAfter(hist.tcg, 7 * 86400000);
  const tcg30 = pickAtOrAfter(hist.tcg, 30 * 86400000);

  const tcgCur: "USD" | "EUR" =
    tcgLatest?.currency?.toUpperCase() === "EUR" ? "EUR" : "USD";

  function convPrice(n: number | null, src: "USD" | "EUR") {
    if (n == null) return null;
    if (display === "NATIVE") return n;
    const out = convert(n, src, display);
    return out ?? n;
  }

  const metrics: Array<{ label: string; latest: string | null; d7: string | null; d30: string | null }> = [];

  function addTcgMetric(label: string, key: keyof TcgHist) {
    const L = asNum(tcgLatest?.[key] ?? null);
    const A7 = asNum(tcg7?.[key] ?? null);
    const A30 = asNum(tcg30?.[key] ?? null);

    const Lc = convPrice(L, tcgCur);
    const C7 = convPrice(A7, tcgCur);
    const C30 = convPrice(A30, tcgCur);

    metrics.push({
      label: `TCGplayer ${label}`,
      latest: Lc == null ? null : formatMoney(Lc, display === "NATIVE" ? tcgCur : display),
      d7: pctChange(C7, Lc),
      d30: pctChange(C30, Lc),
    });
  }

  addTcgMetric("Normal", "normal");
  addTcgMetric("Holofoil", "holofoil");
  addTcgMetric("Reverse Holofoil", "reverse_holofoil");

  const cmLatest = hist.cm.at(-1) ?? null;
  const cm7 = pickAtOrAfter(hist.cm, 7 * 86400000);
  const cm30 = pickAtOrAfter(hist.cm, 30 * 86400000);

  function addCmMetric(label: string, key: keyof CmHist) {
    const L = asNum(cmLatest?.[key] ?? null);
    const A7 = asNum(cm7?.[key] ?? null);
    const A30 = asNum(cm30?.[key] ?? null);

    const Lc = convPrice(L, "EUR");
    const C7 = convPrice(A7, "EUR");
    const C30 = convPrice(A30, "EUR");

    metrics.push({
      label: `Cardmarket ${label}`,
      latest: Lc == null ? null : formatMoney(Lc, display === "NATIVE" ? "EUR" : display),
      d7: pctChange(C7, Lc),
      d30: pctChange(C30, Lc),
    });
  }

  addCmMetric("Trend", "trend_price");
  addCmMetric("Average", "average_sell_price");

  const noHistory = metrics.length === 0 || metrics.every((m) => !m.latest);

  return (
    <section className="space-y-8">
      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Prices: {core.name ?? core.id}
            </h1>
            <div className="mt-1 text-sm text-white/70">
              Market snapshot + trends.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-md border border-white/20 bg-white/10 p-1 text-sm text-white">
              <span className="px-2">Display:</span>

              <Link
                href={withParam(baseHref, "display", "NATIVE")}
                className={`rounded px-2 py-1 ${display === "NATIVE" ? "bg-white/20" : "hover:bg-white/10"}`}
              >
                Native
              </Link>

              <Link
                href={withParam(baseHref, "display", "USD")}
                className={`ml-1 rounded px-2 py-1 ${display === "USD" ? "bg-white/20" : "hover:bg-white/10"}`}
              >
                USD
              </Link>

              <Link
                href={withParam(baseHref, "display", "EUR")}
                className={`ml-1 rounded px-2 py-1 ${display === "EUR" ? "bg-white/20" : "hover:bg-white/10"}`}
              >
                EUR
              </Link>
            </div>

            <Link href={baseDetail} className="text-sky-300 hover:underline">
              ← Card detail
            </Link>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <MarketPrices category="pokemon" cardId={core.id} display={display} />
      </div>

      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm text-white">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Recent Trends</h2>
          <div className="text-xs text-white/60">
            {display === "NATIVE"
              ? "Native market currencies"
              : `Converted to ${display}${fx.usdToEur || fx.eurToUsd ? "" : " (no FX set; fallback used)"}`}
          </div>
        </div>

        {noHistory ? (
          <div className="text-sm text-white/70">Not enough historical data yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-white/70">
                  <th className="py-2 pr-4 text-left">Metric</th>
                  <th className="py-2 pr-4 text-left">Latest</th>
                  <th className="py-2 pr-4 text-left">7d</th>
                  <th className="py-2 pr-4 text-left">30d</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {metrics.map((m) => (
                  <tr key={m.label}>
                    <td className="py-2 pr-4">{m.label}</td>
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

      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/categories/pokemon/cards" className="text-sky-300 hover:underline">
          ← Back to cards
        </Link>
        <Link href={baseDetail} className="text-sky-300 hover:underline">
          ← Back to detail
        </Link>
      </div>
    </section>
  );
}
