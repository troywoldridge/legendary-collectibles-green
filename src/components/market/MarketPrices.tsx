import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { type DisplayCurrency, convert, formatMoney } from "@/lib/pricing";

type Props = {
  category: string;
  cardId: string;
  display: DisplayCurrency;
};

type TcgdexCardRow = {
  id: string;
  raw_json: any;
};

type MtgSnapshotRow = {
  scryfall_id: string;
  snapshot_date: string | null;
  usd: string | null;
  usd_foil: string | null;
  usd_etched: string | null;
  eur: string | null;
  eur_foil: string | null;
  eur_etched: string | null;
  tix: string | null;
};

type Money = {
  amount: number;
  currency: "USD" | "EUR";
};

function safeString(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = safeString(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function normCur(v: unknown): "USD" | "EUR" {
  const s = safeString(v).trim().toUpperCase();
  return s === "EUR" ? "EUR" : "USD";
}

function money(amount: number | null, currency: "USD" | "EUR"): Money | null {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return null;
  return { amount, currency };
}

function pickPriceFromBucket(bucket: any): number | null {
  const market = toNum(bucket?.marketPrice);
  if (market != null && market > 0) return market;

  const mid = toNum(bucket?.midPrice);
  if (mid != null && mid > 0) return mid;

  const low = toNum(bucket?.lowPrice);
  if (low != null && low > 0) return low;

  const high = toNum(bucket?.highPrice);
  if (high != null && high > 0) return high;

  return null;
}

function showMoney(m: Money, display: DisplayCurrency) {
  const native = m.currency;
  const nativeAmt = m.amount;

  if (display === "NATIVE") return formatMoney(nativeAmt, native);

  const converted = convert(nativeAmt, native, display) ?? nativeAmt;
  return formatMoney(converted, display);
}

function fmtUpdated(v: unknown) {
  const s = safeString(v).trim();
  if (!s) return "—";
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return s;
  return new Date(t).toISOString().slice(0, 10);
}

function normalizeCategory(category: string) {
  const c = String(category || "").trim().toLowerCase();

  if (c === "mtg" || c === "magic" || c === "magic-the-gathering") return "mtg";
  if (c === "pokemon" || c === "pokémon") return "pokemon";

  return c;
}

async function getTcgdexCard(cardId: string): Promise<TcgdexCardRow | null> {
  const res = await db.execute<TcgdexCardRow>(sql`
    SELECT id, raw_json
    FROM public.tcgdex_cards
    WHERE id = ${cardId}
    LIMIT 1
  `);

  return res.rows?.[0] ?? null;
}

async function getLatestMtgSnapshot(cardId: string): Promise<MtgSnapshotRow | null> {
  const res = await db.execute<MtgSnapshotRow>(sql`
    SELECT
      s.scryfall_id::text AS scryfall_id,
      TO_CHAR(s.snapshot_date, 'YYYY-MM-DD') AS snapshot_date,
      s.usd::text AS usd,
      s.usd_foil::text AS usd_foil,
      s.usd_etched::text AS usd_etched,
      s.eur::text AS eur,
      s.eur_foil::text AS eur_foil,
      s.eur_etched::text AS eur_etched,
      s.tix::text AS tix
    FROM public.skryfall_price_snapshots_daily s
    WHERE s.scryfall_id::text = ${cardId}
    ORDER BY s.snapshot_date DESC, s.ingested_at DESC, s.id DESC
    LIMIT 1
  `);

  return res.rows?.[0] ?? null;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/5 p-2">
      <div className="text-xs text-white/60">{label}</div>
      <div className="mt-0.5 font-medium text-white">{value}</div>
    </div>
  );
}

function PokemonPrices({
  raw,
  display,
}: {
  raw: any;
  display: DisplayCurrency;
}) {
  const pricing = raw?.pricing ?? {};
  const tcg = pricing?.tcgplayer ?? null;
  const cm = pricing?.cardmarket ?? null;

  const tcgUnit = normCur(tcg?.unit ?? "USD");
  const tcgUpdated = fmtUpdated(tcg?.updated);

  const tcgNormal = money(pickPriceFromBucket(tcg?.normal), tcgUnit);
  const tcgReverse = money(pickPriceFromBucket(tcg?.["reverse-holofoil"]), tcgUnit);
  const tcgHolo = money(pickPriceFromBucket(tcg?.holofoil), tcgUnit);

  const cmUpdated = fmtUpdated(cm?.updated);
  const cmUnit: "EUR" = "EUR";

  const cmTrend = money(toNum(cm?.trend), cmUnit);
  const cmAvg = money(toNum(cm?.avg), cmUnit);
  const cmLow = money(toNum(cm?.low), cmUnit);

  const cmTrendHolo = money(toNum(cm?.["trend-holo"]), cmUnit);
  const cmAvgHolo = money(toNum(cm?.["avg-holo"]), cmUnit);
  const cmLowHolo = money(toNum(cm?.["low-holo"]), cmUnit);

  const hasAny =
    !!tcgNormal ||
    !!tcgReverse ||
    !!tcgHolo ||
    !!cmTrend ||
    !!cmAvg ||
    !!cmLow ||
    !!cmTrendHolo ||
    !!cmAvgHolo ||
    !!cmLowHolo;

  if (!hasAny) {
    return (
      <div className="rounded-xl border border-white/15 bg-white/5 p-5 text-white">
        <h2 className="mb-1 text-lg font-semibold">Market Prices</h2>
        <div className="text-sm text-white/70">
          No pricing fields available in the Pokémon snapshot yet.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/15 bg-white/5 p-5 text-white">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Market Prices</h2>
        <div className="text-xs text-white/60">Snapshot source: tcgdex raw_json.pricing</div>
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-white">TCGplayer</div>
          <div className="text-xs text-white/60">Updated {tcgUpdated}</div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Row label="Normal" value={tcgNormal ? showMoney(tcgNormal, display) : "—"} />
          <Row label="Reverse Holo" value={tcgReverse ? showMoney(tcgReverse, display) : "—"} />
          <Row label="Holofoil" value={tcgHolo ? showMoney(tcgHolo, display) : "—"} />
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-white">Cardmarket</div>
          <div className="text-xs text-white/60">Updated {cmUpdated}</div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Row label="Trend" value={cmTrend ? showMoney(cmTrend, display) : "—"} />
          <Row label="Average" value={cmAvg ? showMoney(cmAvg, display) : "—"} />
          <Row label="Low" value={cmLow ? showMoney(cmLow, display) : "—"} />
        </div>

        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Row label="Trend (Holo)" value={cmTrendHolo ? showMoney(cmTrendHolo, display) : "—"} />
          <Row label="Average (Holo)" value={cmAvgHolo ? showMoney(cmAvgHolo, display) : "—"} />
          <Row label="Low (Holo)" value={cmLowHolo ? showMoney(cmLowHolo, display) : "—"} />
        </div>
      </div>
    </div>
  );
}

function MtgPrices({
  snapshot,
  display,
}: {
  snapshot: MtgSnapshotRow;
  display: DisplayCurrency;
}) {
  const usd = money(toNum(snapshot.usd), "USD");
  const usdFoil = money(toNum(snapshot.usd_foil), "USD");
  const usdEtched = money(toNum(snapshot.usd_etched), "USD");

  const eur = money(toNum(snapshot.eur), "EUR");
  const eurFoil = money(toNum(snapshot.eur_foil), "EUR");
  const eurEtched = money(toNum(snapshot.eur_etched), "EUR");

  const tixNum = toNum(snapshot.tix);

  const hasAny = !!usd || !!usdFoil || !!usdEtched || !!eur || !!eurFoil || !!eurEtched || (tixNum != null && tixNum > 0);

  if (!hasAny) {
    return (
      <div className="rounded-xl border border-white/15 bg-white/5 p-5 text-white">
        <h2 className="mb-1 text-lg font-semibold">Market Prices</h2>
        <div className="text-sm text-white/70">
          No pricing fields available in the Scryfall snapshot yet.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/15 bg-white/5 p-5 text-white">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Market Prices</h2>
        <div className="text-xs text-white/60">
          Snapshot source: skryfall_price_snapshots_daily
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-white">Scryfall</div>
          <div className="text-xs text-white/60">Snapshot {fmtUpdated(snapshot.snapshot_date)}</div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Row label="USD" value={usd ? showMoney(usd, display) : "—"} />
          <Row label="USD Foil" value={usdFoil ? showMoney(usdFoil, display) : "—"} />
          <Row label="USD Etched" value={usdEtched ? showMoney(usdEtched, display) : "—"} />
        </div>

        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Row label="EUR" value={eur ? showMoney(eur, display) : "—"} />
          <Row label="EUR Foil" value={eurFoil ? showMoney(eurFoil, display) : "—"} />
          <Row label="EUR Etched" value={eurEtched ? showMoney(eurEtched, display) : "—"} />
        </div>

        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Row label="MTGO TIX" value={tixNum != null && tixNum > 0 ? String(tixNum) : "—"} />
        </div>
      </div>
    </div>
  );
}

export default async function MarketPrices({ category, cardId, display }: Props) {
  const normalized = normalizeCategory(category);

  if (normalized === "mtg") {
    const snapshot = await getLatestMtgSnapshot(cardId);

    if (!snapshot) {
      return (
        <div className="rounded-xl border border-white/15 bg-white/5 p-5 text-white">
          <h2 className="mb-1 text-lg font-semibold">Market Prices</h2>
          <div className="text-sm text-white/70">
            No Scryfall snapshot found for this card yet.
          </div>
        </div>
      );
    }

    return <MtgPrices snapshot={snapshot} display={display} />;
  }

  const row = await getTcgdexCard(cardId);
  const raw = row?.raw_json ?? null;

  if (!raw) {
    return (
      <div className="rounded-xl border border-white/15 bg-white/5 p-5 text-white">
        <h2 className="mb-1 text-lg font-semibold">Market Prices</h2>
        <div className="text-sm text-white/70">
          No tcgdex snapshot found for this card yet.
        </div>
      </div>
    );
  }

  return <PokemonPrices raw={raw} display={display} />;
}
