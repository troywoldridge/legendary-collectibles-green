import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { centsToUsd } from "@/lib/pricecharting";
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
  const res = await db.execute<{ market_item_id: string }>(sql`
    SELECT market_item_id
    FROM public.market_item_external_ids
    WHERE category = ${category}
      AND external_id = ${cardId}
    LIMIT 1
  `);

  return res.rows?.[0]?.market_item_id ?? null;
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
      as_of_date::text
    FROM public.market_prices_current
    WHERE market_item_id = ${marketItemId}
    LIMIT 1
  `);

  return res.rows?.[0] ?? null;
}

export default async function MarketPrices({
  category,
  cardId,
  display,
}: Props) {
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

  const native = price.currency.toUpperCase() as "USD" | "EUR";
  const converted =
    display === "NATIVE"
      ? price.price_cents
      : convert(price.price_cents, native, display) ?? price.price_cents;

  const formatted =
    display === "NATIVE"
      ? formatMoney(price.price_cents, native)
      : formatMoney(converted, display);

  return (
    <div className="rounded-xl border border-white/15 bg-white/5 p-5 text-white">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Market Price</h2>
        <div className="text-xs text-white/60">
          As of {price.as_of_date}
        </div>
      </div>

      <div className="text-2xl font-bold">{formatted}</div>

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
