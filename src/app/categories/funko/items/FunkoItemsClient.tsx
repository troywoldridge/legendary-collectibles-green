// src/app/categories/funko/items/FunkoItemsClient.tsx
"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { FunkoListRow } from "@/lib/funko/query";

type Initial = {
  items: FunkoListRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  sort: string;
  order: string;
  applied: any;
};

function fmtMoneyCents(cents: number | null) {
  if (cents == null || !Number.isFinite(cents)) return null;
  const v = cents / 100;
  return v.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function qsSet(url: URL, key: string, value: string | null) {
  if (!value) url.searchParams.delete(key);
  else url.searchParams.set(key, value);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

type Overrides = Partial<Record<string, string | null>>;

export default function FunkoItemsClient({ initial }: { initial: Initial }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [q, setQ] = useState<string>(() => sp.get("q") ?? "");
  const [franchise, setFranchise] = useState<string>(() => sp.get("franchise") ?? "");
  const [series, setSeries] = useState<string>(() => sp.get("series") ?? "");
  const [rarity, setRarity] = useState<string>(() => sp.get("rarity") ?? "");
  const [chase, setChase] = useState<string>(() => sp.get("chase") ?? "");
  const [exclusive, setExclusive] = useState<string>(() => sp.get("exclusive") ?? "");
  const [sort, setSort] = useState<string>(() => sp.get("sort") ?? initial.sort ?? "relevance");
  const [order, setOrder] = useState<string>(() => sp.get("order") ?? initial.order ?? "desc");
  const [yearMin, setYearMin] = useState<string>(() => sp.get("yearMin") ?? "");
  const [yearMax, setYearMax] = useState<string>(() => sp.get("yearMax") ?? "");
  const [priceMin, setPriceMin] = useState<string>(() => sp.get("priceMin") ?? "");
  const [priceMax, setPriceMax] = useState<string>(() => sp.get("priceMax") ?? "");
  const [pageSize, setPageSize] = useState<string>(
    () => sp.get("pageSize") ?? String(initial.pageSize ?? 48),
  );

  // keep inputs in sync when URL changes
  useEffect(() => {
    setQ(sp.get("q") ?? "");
    setFranchise(sp.get("franchise") ?? "");
    setSeries(sp.get("series") ?? "");
    setRarity(sp.get("rarity") ?? "");
    setChase(sp.get("chase") ?? "");
    setExclusive(sp.get("exclusive") ?? "");
    setSort(sp.get("sort") ?? initial.sort ?? "relevance");
    setOrder(sp.get("order") ?? initial.order ?? "desc");
    setYearMin(sp.get("yearMin") ?? "");
    setYearMax(sp.get("yearMax") ?? "");
    setPriceMin(sp.get("priceMin") ?? "");
    setPriceMax(sp.get("priceMax") ?? "");
    setPageSize(sp.get("pageSize") ?? String(initial.pageSize ?? 48));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp?.toString()]);

  const data = initial;

  const apply = (overrides?: Overrides) => {
    const url = new URL(window.location.href);

    qsSet(url, "q", q.trim() || null);
    qsSet(url, "franchise", franchise.trim() || null);
    qsSet(url, "series", series.trim() || null);
    qsSet(url, "rarity", rarity.trim() || null);
    qsSet(url, "chase", chase.trim() || null);
    qsSet(url, "exclusive", exclusive.trim() || null);
    qsSet(url, "sort", sort.trim() || null);
    qsSet(url, "order", order.trim() || null);
    qsSet(url, "yearMin", yearMin.trim() || null);
    qsSet(url, "yearMax", yearMax.trim() || null);
    qsSet(url, "priceMin", priceMin.trim() || null);
    qsSet(url, "priceMax", priceMax.trim() || null);
    qsSet(url, "pageSize", pageSize.trim() || null);

    // reset to page 1 on new filters unless explicitly overridden
    if (!overrides?.page) url.searchParams.set("page", "1");

    // ✅ Fix: Object.entries makes v possibly undefined — coerce to null.
    if (overrides) {
      for (const [k, v] of Object.entries(overrides)) {
        qsSet(url, k, v ?? null);
      }
    }

    startTransition(() => router.push(url.pathname + url.search));
  };

  const clear = () => {
    startTransition(() => router.push("/categories/funko/items"));
  };

  const pager = useMemo(() => {
    const page = Number(sp.get("page") ?? data.page ?? 1) || 1;
    const totalPages = data.totalPages ?? 1;
    return { page, totalPages };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp?.toString(), data.totalPages]);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <div className="grid gap-3 md:grid-cols-12">
          <div className="md:col-span-6">
            <label className="text-xs uppercase tracking-wide text-white/60">Search</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, series, franchise, number…"
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30"
            />
          </div>

          <div className="md:col-span-3">
            <label className="text-xs uppercase tracking-wide text-white/60">Franchise</label>
            <input
              value={franchise}
              onChange={(e) => setFranchise(e.target.value)}
              placeholder="e.g. Marvel"
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30"
            />
          </div>

          <div className="md:col-span-3">
            <label className="text-xs uppercase tracking-wide text-white/60">Series</label>
            <input
              value={series}
              onChange={(e) => setSeries(e.target.value)}
              placeholder="e.g. Spider-Man"
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30"
            />
          </div>

          <div className="md:col-span-3">
            <label className="text-xs uppercase tracking-wide text-white/60">Filter</label>
            <select
              value={rarity}
              onChange={(e) => setRarity(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            >
              <option value="">All</option>
              <option value="chase">Chase</option>
              <option value="exclusive">Exclusive</option>
              <option value="rare">Rare (extra.rarity)</option>
              <option value="common">Common (extra.rarity)</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="text-xs uppercase tracking-wide text-white/60">Chase</label>
            <select
              value={chase}
              onChange={(e) => setChase(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            >
              <option value="">Any</option>
              <option value="true">Only chase</option>
              <option value="false">Exclude chase</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="text-xs uppercase tracking-wide text-white/60">Exclusive</label>
            <select
              value={exclusive}
              onChange={(e) => setExclusive(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            >
              <option value="">Any</option>
              <option value="true">Only exclusive</option>
              <option value="false">Exclude exclusive</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="text-xs uppercase tracking-wide text-white/60">Sort</label>
            <div className="mt-1 flex gap-2">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
              >
                <option value="relevance">Relevance</option>
                <option value="release_year">Release year</option>
                <option value="name">Name</option>
                <option value="price">Estimated price</option>
                <option value="franchise">Franchise</option>
                <option value="series">Series</option>
              </select>
              <button
                type="button"
                onClick={() => setOrder((o) => (o === "asc" ? "desc" : "asc"))}
                className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs text-white/85 hover:bg-white/10"
                title="Toggle ascending/descending"
              >
                {order === "asc" ? "↑" : "↓"}
              </button>
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="text-xs uppercase tracking-wide text-white/60">Year min</label>
            <input
              value={yearMin}
              onChange={(e) => setYearMin(e.target.value)}
              inputMode="numeric"
              placeholder="e.g. 2018"
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30"
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs uppercase tracking-wide text-white/60">Year max</label>
            <input
              value={yearMax}
              onChange={(e) => setYearMax(e.target.value)}
              inputMode="numeric"
              placeholder="e.g. 2026"
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30"
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs uppercase tracking-wide text-white/60">Price min (¢)</label>
            <input
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value)}
              inputMode="numeric"
              placeholder="e.g. 1500"
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30"
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs uppercase tracking-wide text-white/60">Price max (¢)</label>
            <input
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value)}
              inputMode="numeric"
              placeholder="e.g. 8000"
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30"
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs uppercase tracking-wide text-white/60">Page size</label>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            >
              <option value="24">24</option>
              <option value="48">48</option>
              <option value="72">72</option>
              <option value="96">96</option>
            </select>
          </div>

          <div className="md:col-span-12 flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => apply()}
              className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15"
            >
              {isPending ? "Applying…" : "Apply"}
            </button>
            <button
              type="button"
              onClick={clear}
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white/85 hover:bg-white/10"
            >
              Clear
            </button>
            <div className="ml-auto text-sm text-white/70">
              {data.total.toLocaleString()} results • page {pager.page} / {pager.totalPages}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {data.items.map((x) => {
          const img = x.image_large || x.image_small;
          const title = `${x.name ?? x.id}${x.number ? ` #${x.number}` : ""}`;
          const price = fmtMoneyCents(x.est_price_cents);
          const flags = [
            x.is_chase ? "Chase" : null,
            x.is_exclusive || (x.exclusivity ?? "").trim() ? "Exclusive" : null,
            x.rarity ? `Rarity: ${x.rarity}` : null,
          ].filter(Boolean);

          return (
            <Link
              key={x.id}
              href={`/categories/funko/items/${encodeURIComponent(x.id)}`}
              className="rounded-xl border border-white/10 bg-black/20 p-2 hover:bg-white/5"
            >
              <div className="relative aspect-square overflow-hidden rounded-lg border border-white/10 bg-black/30">
                {img ? (
                  <Image
                    src={img}
                    alt={title}
                    fill
                    unoptimized
                    className="object-contain"
                    sizes="220px"
                  />
                ) : (
                  <div className="absolute inset-0 grid place-items-center text-xs text-white/60">
                    No image
                  </div>
                )}
              </div>
              <div className="mt-2 text-sm font-medium text-white line-clamp-2">{title}</div>
              <div className="mt-1 text-xs text-white/60">
                {x.franchise ? <span className="mr-2">{x.franchise}</span> : null}
                {x.series ? <span className="mr-2">{x.series}</span> : null}
                {x.release_year ? <span>{x.release_year}</span> : null}
              </div>
              {price ? <div className="mt-1 text-xs text-white/80">Est: {price}</div> : null}
              {x.sale_percent && x.sale_percent > 0 ? (
                <div className="mt-1 text-xs text-white/80">Sale: {x.sale_percent}%</div>
              ) : null}
              {flags.length ? (
                <div className="mt-1 text-[11px] text-white/60">{flags.join(" • ")}</div>
              ) : null}
            </Link>
          );
        })}
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => apply({ page: String(clamp(pager.page - 1, 1, pager.totalPages)) })}
          disabled={pager.page <= 1}
          className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white/85 hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-white/5"
        >
          ← Prev
        </button>

        <div className="text-sm text-white/70">
          Page <span className="text-white/90">{pager.page}</span> of{" "}
          <span className="text-white/90">{pager.totalPages}</span>
        </div>

        <button
          type="button"
          onClick={() => apply({ page: String(clamp(pager.page + 1, 1, pager.totalPages)) })}
          disabled={pager.page >= pager.totalPages}
          className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white/85 hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-white/5"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
