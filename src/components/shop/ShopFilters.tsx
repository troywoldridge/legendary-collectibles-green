// src/components/shop/ShopFilters.tsx
"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const SORTS = [
  { v: "featured", label: "Featured" },
  { v: "new", label: "New" },
  { v: "price_asc", label: "Price: Low → High" },
  { v: "price_desc", label: "Price: High → Low" },
];

export default function ShopFilters({ game, format }: { game: string; format: string }) {
  const sp = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const initial = useMemo(() => {
    const get = (k: string) => sp.get(k) ?? "";
    return {
      q: get("q"),
      tag: get("tag"),
      sealed: get("sealed"),
      graded: get("graded"),
      grader: get("grader"),
      gradeMin: get("gradeMin"),
      condition: get("condition"),
      priceMin: get("priceMin"),
      priceMax: get("priceMax"),
      sort: get("sort") || "featured",
    };
  }, [sp]);

  const [state, setState] = useState(initial);

  function apply() {
    const next = new URLSearchParams();

    // Keep route params implicit, listing page will set game/format itself
    for (const [k, v] of Object.entries(state)) {
      const value = (v ?? "").toString().trim();
      if (value.length) next.set(k, value);
    }

    // Reset pagination when filters change
    next.delete("page");

    router.push(`${pathname}?${next.toString()}`);
  }

  function clearAll() {
    router.push(`${pathname}`);
  }

  return (
    <div className="filters">
      <div className="filtersRow">
        <div className="filtersLabel">Search</div>
        <input
  className="input"
  value={state.q}
  onChange={(e) => setState((s) => ({ ...s, q: e.target.value }))}
  onKeyDown={(e) => {
    if (e.key === "Enter") apply();
  }}
  placeholder="Search title…"
/>

      </div>

      <div className="filtersRow">
        <div className="filtersLabel">Sort</div>
        <select
          className="select"
          value={state.sort}
          onChange={(e) => setState((s) => ({ ...s, sort: e.target.value }))}
        >
          {SORTS.map((s) => (
            <option key={s.v} value={s.v}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="filtersRow">
        <div className="filtersLabel">Intent</div>
        <select
          className="select"
          value={state.tag}
          onChange={(e) => setState((s) => ({ ...s, tag: e.target.value }))}
        >
          <option value="">(none)</option>
          <option value="hot-deals">🔥 Hot Deals</option>
          <option value="new-arrivals">🆕 New Arrivals</option>
          <option value="best-sellers">⭐ Best Sellers</option>
          <option value="gifts-under-50">🎁 Gifts Under $50</option>
        </select>
      </div>

      <div className="filtersRow">
        <div className="filtersLabel">Sealed</div>
        <select
          className="select"
          value={state.sealed}
          onChange={(e) => setState((s) => ({ ...s, sealed: e.target.value }))}
        >
          <option value="">Any</option>
          <option value="true">Sealed only</option>
          <option value="false">Not sealed</option>
        </select>
      </div>

      <div className="filtersRow">
        <div className="filtersLabel">Graded</div>
        <select
          className="select"
          value={state.graded}
          onChange={(e) => setState((s) => ({ ...s, graded: e.target.value }))}
        >
          <option value="">Any</option>
          <option value="true">Graded only</option>
          <option value="false">Raw only</option>
        </select>
      </div>

      <div className="filtersRow">
        <div className="filtersLabel">Grader</div>
        <select
          className="select"
          value={state.grader}
          onChange={(e) => setState((s) => ({ ...s, grader: e.target.value }))}
        >
          <option value="">Any</option>
          <option value="psa">PSA</option>
          <option value="bgs">BGS</option>
          <option value="cgc">CGC</option>
          <option value="sgc">SGC</option>
        </select>
      </div>

      <div className="filtersRow">
        <div className="filtersLabel">Grade Min (x10)</div>
        <input
          className="input"
          value={state.gradeMin}
          onChange={(e) => setState((s) => ({ ...s, gradeMin: e.target.value }))}
          placeholder="e.g. 90 (9.0), 100 (10)"
        />
      </div>

      <div className="filtersRow">
        <div className="filtersLabel">Condition</div>
        <select
          className="select"
          value={state.condition}
          onChange={(e) => setState((s) => ({ ...s, condition: e.target.value }))}
        >
          <option value="">Any</option>
          <option value="nm">Near Mint</option>
          <option value="lp">Light Play</option>
          <option value="mp">Moderate Play</option>
          <option value="hp">Heavy Play</option>
          <option value="dmg">Damaged</option>
        </select>
      </div>

      <div className="filtersRow">
        <div className="filtersLabel">Price (cents)</div>
        <div className="twoCol">
          <input
            className="input"
            value={state.priceMin}
            onChange={(e) => setState((s) => ({ ...s, priceMin: e.target.value }))}
            placeholder="min"
          />
          <input
            className="input"
            value={state.priceMax}
            onChange={(e) => setState((s) => ({ ...s, priceMax: e.target.value }))}
            placeholder="max"
          />
        </div>
      </div>

      <div className="filtersActions">
        <button className="btn" onClick={apply}>Apply</button>
        <button className="btn btnGhost" onClick={clearAll}>Clear</button>
      </div>
    </div>
  );
}
