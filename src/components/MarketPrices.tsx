/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";
import {
  loadCardPrices,
  type DisplayCurrency,
  type PriceCategory,
} from "@/lib/pricing";

type MarketPriceRow = { label: string; value: string | null };
type MarketPriceBlock = {
  market: string;
  updatedAt?: string | null;
  rows: MarketPriceRow[];
};

type MarketPriceSummary = {
  display: DisplayCurrency | "NATIVE";
  hasAnyPrice?: boolean;
  blocks: MarketPriceBlock[];
  latestUpdatedAt?: string | null;
};

function buildPlaceholderBlocks(category: PriceCategory): MarketPriceBlock[] {
  // For all TCG-style categories, we want the same vendor layout
  const markets = ["TCGplayer", "Cardmarket", "eBay", "Amazon", "CoolStuffInc"];

  return markets.map((market) => ({
    market,
    updatedAt: null,
    rows: [{ label: "Price", value: null }],
  }));
}

export default async function MarketPrices({
  category,
  cardId,
  display = "NATIVE",
  title = "Market Prices",
}: {
  category: PriceCategory;
  cardId: string;
  display?: DisplayCurrency;
  title?: string;
}) {
  const raw = (await loadCardPrices({
    category,
    cardId,
    display,
  })) as any;

  // If we have a real summary with blocks, use it. Otherwise synthesize a
  // placeholder summary so the grid + vendors still render with N/A values.
  const summary: MarketPriceSummary =
    raw && raw.blocks && raw.blocks.length > 0
      ? (raw as MarketPriceSummary)
      : {
          display,
          hasAnyPrice: false,
          latestUpdatedAt: raw?.latestUpdatedAt ?? null,
          blocks: buildPlaceholderBlocks(category),
        };

  return (
    <div className="rounded-xl border border-white/15 bg-white/5 p-4 text-white/90">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <div className="text-xs text-white/70">
          Shown in{" "}
          {summary.display === "NATIVE"
            ? "native market currency"
            : summary.display}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {summary.blocks.map((b) => (
          <div
            key={b.market}
            className="rounded-lg border border-white/10 bg-white/5 p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="font-medium text-white">{b.market}</div>
              {b.updatedAt ? (
                <div className="text-[10px] text-white/60">
                  Updated {b.updatedAt}
                </div>
              ) : null}
            </div>
            <ul className="divide-y divide-white/10">
              {b.rows.map((r) => (
                <li
                  key={r.label}
                  className="flex items-center justify-between py-1.5 text-sm"
                >
                  <span className="text-white/85">{r.label}</span>
                  <span className="font-medium">{r.value ?? "N/A"}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {summary.latestUpdatedAt && (
        <p className="mt-3 text-xs text-white/60">
          Latest update: {summary.latestUpdatedAt}
        </p>
      )}
    </div>
  );
}
