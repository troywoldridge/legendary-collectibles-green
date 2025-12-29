"use client";

import { useMemo, useState } from "react";

type PriceRow = {
  variant_type: string;
  low_price: number | null;
  mid_price: number | null;
  high_price: number | null;
  market_price: number | null;
  currency: string | null;
};

export function CardVariantPricing({
  variants,
  prices,
}: {
  variants: {
    normal?: boolean;
    holo?: boolean;
    reverse?: boolean;
    first_edition?: boolean;
    w_promo?: boolean;
  } | null;
  prices: PriceRow[];
}) {
  const options = useMemo(() => {
    const out: { key: string; label: string }[] = [];

    if (variants?.normal) out.push({ key: "normal", label: "Normal" });
    if (variants?.holo) out.push({ key: "holofoil", label: "Holofoil" });
    if (variants?.reverse) out.push({ key: "reverse_holofoil", label: "Reverse Holofoil" });
    if (variants?.first_edition) out.push({ key: "first_edition", label: "1st Edition" });
    if (variants?.w_promo) out.push({ key: "promo", label: "Promo" });

    // Fallback: show whatever prices exist if variants missing
    if (out.length === 0 && prices?.length) {
      for (const p of prices) out.push({ key: p.variant_type, label: p.variant_type });
    }

    return out;
  }, [variants, prices]);

  const [selected, setSelected] = useState(options[0]?.key ?? "");

  const row = prices.find((p) => p.variant_type === selected);

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.key}
            onClick={() => setSelected(o.key)}
            className={`text-sm px-3 py-1 rounded border ${
              selected === o.key ? "bg-white/15 border-white/30" : "bg-white/5 border-white/10"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="mt-3 p-3 rounded border border-white/10 bg-white/5">
        {!row ? (
          <div className="text-sm opacity-80">No pricing available for this variant.</div>
        ) : (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>Low</div><div>{fmt(row.low_price, row.currency)}</div>
            <div>Mid</div><div>{fmt(row.mid_price, row.currency)}</div>
            <div>High</div><div>{fmt(row.high_price, row.currency)}</div>
            <div>Market</div><div>{fmt(row.market_price, row.currency)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function fmt(v: number | null | undefined, currency: string | null) {
  if (v === null || v === undefined) return "—";
  const cur = currency || "USD";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(v);
  } catch {
    return `${v}`;
  }
}
