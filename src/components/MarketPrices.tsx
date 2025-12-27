import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { type DisplayCurrency, convert, formatMoney } from "@/lib/pricing";

type Props = {
  category: string; // "pokemon"
  cardId: string;   // e.g. "me1-54"
  display: DisplayCurrency;
};

type CurrentPriceRow = {
  price_cents: number;
  currency: string;
  source: string;
  price_type: string;
  confidence: string;
  as_of_date: string;
};

async function resolveMarketItemId(category: string, cardId: string) {
  const res = await db.execute<{ id: string }>(sql`
    SELECT id
    FROM public.market_items
    WHERE game = ${category}
      AND canonical_id = ${cardId}
    ORDER BY
      CASE
        WHEN canonical_source = 'tcgdex' THEN 0
        WHEN canonical_source = 'internal' THEN 1
        ELSE 2
      END,
      updated_at DESC
    LIMIT 1
  `);

  return res.rows?.[0]?.id ?? null;
}

async function loadCurrentMarketPrice(
  marketItemId: string,
): Promise<CurrentPriceRow | null> {
  const res = await db.execute<CurrentPriceRow>(sql`
    SELECT
      price_cents,
      currency,
      source,
      price_type,
      confidence,
      as_of_date::text AS as_of_date
    FROM public.market_prices_current
    WHERE market_item_id = ${marketItemId}
    ORDER BY
      CASE WHEN source = 'priority_fallback' THEN 0 ELSE 1 END,
      updated_at DESC
    LIMIT 1
  `);

  return res.rows?.[0] ?? null;
}

export default async function MarketPrices({ category, cardId, display }: Props) {
  const marketItemId = await resolveMarketItemId(category, cardId);

  if (!marketItemId) {
    return (
      <div className="rounded-xl border border-white/15 bg-white/5 p-5 text-white">
        <h2 className="mb-1 text-lg font-semibold">Market Prices</h2>
        <div className="text-sm text-white/70">
          This card hasn’t been linked to a market item yet.
        </div>
      </div>
    );
  }

  const price = await loadCurrentMarketPrice(marketItemId);

  if (!price) {
    return (
      <div className="rounded-xl border border-white/15 bg-white/5 p-5 text-white">
        <h2 className="mb-1 text-lg font-semibold">Market Prices</h2>
        <div className="text-sm text-white/70">
          No current market price available yet.
        </div>
      </div>
    );
  }

  const native = (price.currency ?? "USD").toUpperCase() === "EUR" ? "EUR" : "USD";

  // cents -> dollars
  const nativeDollars = (price.price_cents ?? 0) / 100;

  // convert() can return null; fallback to nativeDollars
  const convertedDollars =
    display === "NATIVE"
      ? nativeDollars
      : (convert(nativeDollars, native, display) ?? nativeDollars);

  const shown =
    display === "NATIVE"
      ? formatMoney(nativeDollars, native)
      : formatMoney(convertedDollars, display);

  return (
    <div className="rounded-xl border border-white/15 bg-white/5 p-5 text-white">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Market Price</h2>
        <div className="text-xs text-white/60">As of {price.as_of_date}</div>
      </div>

      <div className="text-2xl font-bold">{shown}</div>

      <div className="mt-2 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <Meta label="Source" value={price.source} />
        <Meta label="Type" value={price.price_type} />
        <Meta label="Confidence" value={price.confidence} />
        <Meta label="Currency" value={price.currency} />
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/5 p-2">
      <div className="text-white/60">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
