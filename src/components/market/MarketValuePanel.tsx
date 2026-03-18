import "server-only";

import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { convert, formatMoney } from "@/lib/pricing";

type Props = {
  game: "pokemon" | "yugioh" | "mtg" | "funko";
  canonicalId: string;
  canonicalSource?: string | null;
  title?: string;
  showDisclaimer?: boolean;
  canSeeRanges?: boolean;
  canSeeConfidence?: boolean;
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

function moneyUsd(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n) || n <= 0) return "—";
  return formatMoney(n, "USD");
}

function fmtUpdated(v: unknown) {
  const s = safeString(v).trim();
  if (!s) return null;
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return s;
  return new Date(t).toISOString().slice(0, 10);
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

function normalizeGame(game: Props["game"]) {
  const g = String(game || "").trim().toLowerCase();
  if (g === "mtg" || g === "magic" || g === "magic-the-gathering") return "mtg";
  if (g === "pokemon" || g === "pokémon") return "pokemon";
  if (g === "yugioh" || g === "yu-gi-oh") return "yugioh";
  if (g === "funko") return "funko";
  return g;
}

async function getTcgdexCard(id: string): Promise<TcgdexCardRow | null> {
  const res = await db.execute<TcgdexCardRow>(sql`
    SELECT id, raw_json
    FROM public.tcgdex_cards
    WHERE id = ${id}
    LIMIT 1
  `);
  return res.rows?.[0] ?? null;
}

async function getLatestMtgSnapshot(id: string): Promise<MtgSnapshotRow | null> {
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
    WHERE s.scryfall_id::text = ${id}
    ORDER BY s.snapshot_date DESC, s.ingested_at DESC, s.id DESC
    LIMIT 1
  `);
  return res.rows?.[0] ?? null;
}

function PanelShell({
  title,
  children,
  showDisclaimer,
  disclaimer,
}: {
  title: string;
  children: React.ReactNode;
  showDisclaimer: boolean;
  disclaimer: string;
}) {
  return (
    <section className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      {children}
      {showDisclaimer ? (
        <div className="mt-4 border-t border-white/10 pt-3 text-xs text-white/60">
          {disclaimer}
        </div>
      ) : null}
    </section>
  );
}

function UnavailablePanel({
  title,
  message,
  showDisclaimer,
  disclaimer,
}: {
  title: string;
  message: string;
  showDisclaimer: boolean;
  disclaimer: string;
}) {
  return (
    <PanelShell
      title={title}
      showDisclaimer={showDisclaimer}
      disclaimer={disclaimer}
    >
      <div className="mt-2 text-sm text-white/70">{message}</div>
    </PanelShell>
  );
}

function renderRightColumn({
  canSeeRanges,
  rangeNote,
}: {
  canSeeRanges: boolean;
  rangeNote: string;
}) {
  return (
    <div className="min-w-60">
      <div className="text-xs uppercase tracking-wide text-white/60">Range</div>

      {canSeeRanges ? (
        <div className="mt-1 text-sm text-white">
          <span className="font-semibold">—</span>
          <span className="text-white/50"> — </span>
          <span className="font-semibold">—</span>
        </div>
      ) : (
        <Link
          href="/pricing"
          className="mt-1 inline-block rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
          prefetch={false}
          title="Collector required to view ranges"
        >
          🔒 Collector+ to view range
        </Link>
      )}

      <div className="mt-2 text-[11px] text-white/50">{rangeNote}</div>
    </div>
  );
}

function renderConfidence(canSeeConfidence: boolean) {
  if (canSeeConfidence) {
    return (
      <span className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/80">
        Confidence: <span className="font-semibold text-white">—</span>
      </span>
    );
  }

  return (
    <Link
      href="/pricing"
      className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
      prefetch={false}
      title="Pro required to view confidence"
    >
      Confidence: 🔒 Pro
    </Link>
  );
}

function PokemonBody({
  raw,
  canSeeRanges,
  canSeeConfidence,
}: {
  raw: any;
  canSeeRanges: boolean;
  canSeeConfidence: boolean;
}) {
  const pricing = raw?.pricing ?? {};
  const tcg = pricing?.tcgplayer ?? null;
  const cm = pricing?.cardmarket ?? null;

  const tcgUnit = normCur(tcg?.unit ?? "USD");
  const tcgUpdated = fmtUpdated(tcg?.updated);

  const bestTcg =
    money(pickPriceFromBucket(tcg?.normal), tcgUnit) ??
    money(pickPriceFromBucket(tcg?.["reverse-holofoil"]), tcgUnit) ??
    money(pickPriceFromBucket(tcg?.holofoil), tcgUnit);

  const cmUpdated = fmtUpdated(cm?.updated);
  const cmUnit: "EUR" = "EUR";

  const bestCm =
    money(toNum(cm?.trend), cmUnit) ??
    money(toNum(cm?.avg), cmUnit) ??
    money(toNum(cm?.low), cmUnit) ??
    money(toNum(cm?.["trend-holo"]), cmUnit) ??
    money(toNum(cm?.["avg-holo"]), cmUnit) ??
    money(toNum(cm?.["low-holo"]), cmUnit);

  const best = bestTcg ?? bestCm;

  const marketUsd =
    best == null
      ? null
      : best.currency === "USD"
        ? best.amount
        : (convert(best.amount, "EUR", "USD") ?? null);

  const updated = tcgUpdated ?? cmUpdated ?? null;
  const trend = {
    arrow: "↔",
    label: "No trend data yet (Pokémon snapshot pricing does not provide a daily series here).",
  };

  return (
    <div className="mt-3 flex flex-wrap items-start justify-between gap-6">
      <div className="min-w-[260px]">
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/80">
          <span className="text-2xl font-bold text-white">{moneyUsd(marketUsd)}</span>

          <span
            className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/80"
            title={trend.label}
          >
            {trend.arrow}
          </span>

          {renderConfidence(canSeeConfidence)}
        </div>

        <div className="mt-2 text-xs text-white/60">
          {updated ? <>As of {updated}</> : <>As of latest snapshot</>}
          {best ? (
            <>
              {" "}
              • Source:{" "}
              <span className="text-white/80">{bestTcg ? "TCGplayer" : "Cardmarket"}</span>
            </>
          ) : null}
        </div>

        {!best ? (
          <div className="mt-2 text-xs text-white/70">
            No usable price fields found in the Pokémon snapshot yet.
          </div>
        ) : null}
      </div>

      {renderRightColumn({
        canSeeRanges,
        rangeNote:
          "Ranges require historical aggregation (p25–p75). Pokémon snapshot pricing does not include that yet.",
      })}
    </div>
  );
}

function MtgBody({
  snapshot,
  canSeeRanges,
  canSeeConfidence,
}: {
  snapshot: MtgSnapshotRow;
  canSeeRanges: boolean;
  canSeeConfidence: boolean;
}) {
  const usd = toNum(snapshot.usd);
  const usdFoil = toNum(snapshot.usd_foil);
  const usdEtched = toNum(snapshot.usd_etched);
  const eur = toNum(snapshot.eur);
  const eurFoil = toNum(snapshot.eur_foil);
  const eurEtched = toNum(snapshot.eur_etched);

  const bestUsd =
    usd ??
    usdFoil ??
    usdEtched ??
    (eur != null ? convert(eur, "EUR", "USD") : null) ??
    (eurFoil != null ? convert(eurFoil, "EUR", "USD") : null) ??
    (eurEtched != null ? convert(eurEtched, "EUR", "USD") : null) ??
    null;

  const trend = {
    arrow: "↔",
    label: "No trend data yet (using latest Scryfall daily snapshot only).",
  };

  return (
    <div className="mt-3 flex flex-wrap items-start justify-between gap-6">
      <div className="min-w-[260px]">
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/80">
          <span className="text-2xl font-bold text-white">{moneyUsd(bestUsd)}</span>

          <span
            className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/80"
            title={trend.label}
          >
            {trend.arrow}
          </span>

          {renderConfidence(canSeeConfidence)}
        </div>

        <div className="mt-2 text-xs text-white/60">
          {snapshot.snapshot_date ? <>As of {snapshot.snapshot_date}</> : <>As of latest snapshot</>}
          {" • "}
          <span className="text-white/80">Source: Scryfall daily snapshot</span>
        </div>

        {bestUsd == null ? (
          <div className="mt-2 text-xs text-white/70">
            No usable price fields found in the Scryfall snapshot yet.
          </div>
        ) : (
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-white/70">
            <div>USD: <span className="text-white">{moneyUsd(usd)}</span></div>
            <div>USD Foil: <span className="text-white">{moneyUsd(usdFoil)}</span></div>
            <div>USD Etched: <span className="text-white">{moneyUsd(usdEtched)}</span></div>
            <div>EUR: <span className="text-white">{eur != null ? formatMoney(eur, "EUR") : "—"}</span></div>
            <div>EUR Foil: <span className="text-white">{eurFoil != null ? formatMoney(eurFoil, "EUR") : "—"}</span></div>
            <div>EUR Etched: <span className="text-white">{eurEtched != null ? formatMoney(eurEtched, "EUR") : "—"}</span></div>
          </div>
        )}
      </div>

      {renderRightColumn({
        canSeeRanges,
        rangeNote:
          "Ranges require historical aggregation (p25–p75). This panel is currently using the latest Scryfall daily snapshot only.",
      })}
    </div>
  );
}

export default async function MarketValuePanel({
  game,
  canonicalId,
  canonicalSource = null,
  title = "Market Value",
  showDisclaimer = true,
  canSeeRanges = false,
  canSeeConfidence = false,
}: Props) {
  void canonicalSource;

  const normalizedGame = normalizeGame(game);
  const cid = String(canonicalId ?? "").trim();

  if (!cid) return null;

  if (normalizedGame === "mtg") {
    const snapshot = await getLatestMtgSnapshot(cid);

    if (!snapshot) {
      return (
        <UnavailablePanel
          title={title}
          message="No Scryfall snapshot found yet for this item."
          showDisclaimer={showDisclaimer}
          disclaimer="Market value based on Scryfall daily snapshot pricing when available. Not a guaranteed sale price."
        />
      );
    }

    return (
      <PanelShell
        title={title}
        showDisclaimer={showDisclaimer}
        disclaimer="Market value based on the latest Scryfall daily snapshot. Not a guaranteed sale price."
      >
        <MtgBody
          snapshot={snapshot}
          canSeeRanges={canSeeRanges}
          canSeeConfidence={canSeeConfidence}
        />
      </PanelShell>
    );
  }

  if (normalizedGame === "pokemon") {
    const row = await getTcgdexCard(cid);
    const raw = row?.raw_json ?? null;

    if (!raw) {
      return (
        <UnavailablePanel
          title={title}
          message="No Pokémon snapshot found yet for this item."
          showDisclaimer={showDisclaimer}
          disclaimer="Market value based on Pokémon snapshot pricing when available. Not a guaranteed sale price."
        />
      );
    }

    return (
      <PanelShell
        title={title}
        showDisclaimer={showDisclaimer}
        disclaimer="Market value based on Pokémon snapshot pricing. Not a guaranteed sale price."
      >
        <PokemonBody
          raw={raw}
          canSeeRanges={canSeeRanges}
          canSeeConfidence={canSeeConfidence}
        />
      </PanelShell>
    );
  }

  return (
    <UnavailablePanel
      title={title}
      message="No market value snapshot source is configured for this item yet."
      showDisclaimer={showDisclaimer}
      disclaimer="Market value is unavailable for this item right now."
    />
  );
}
