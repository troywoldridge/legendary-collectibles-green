// src/components/funko/FunkoRelatedPanel.tsx
"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";

export type RelatedFunkoItem = {
  id: string;
  name: string | null;
  franchise: string | null;
  series: string | null;
  line: string | null;
  number: string | null;
  is_chase: boolean | null;
  is_exclusive: boolean | null;
  exclusivity: string | null;
  release_year: number | null;
  image_small: string | null;
  image_large: string | null;
  est_price_cents: number | null;
  sale_percent: number | null;
  rarity: string | null;
};

type Props = {
  items: RelatedFunkoItem[];
};

function fmtMoneyCents(cents: number | null) {
  if (cents == null || !Number.isFinite(cents)) return null;
  const v = cents / 100;
  return v.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function tokens(q: string) {
  const t = norm(q)
    .replace(/[^\p{L}\p{N}\s#-]+/gu, " ")
    .split(" ")
    .filter(Boolean);
  return t.slice(0, 12);
}

export default function FunkoRelatedPanel({ items }: Props) {
  const [q, setQ] = useState("");
  const [rarity, setRarity] = useState<string>("all");
  const [sort, setSort] = useState<"release_year" | "name" | "price">("release_year");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    const tks = tokens(q);

    let out = items;

    if (tks.length) {
      out = out.filter((x) => {
        const hay = norm(
          [
            x.name,
            x.franchise,
            x.series,
            x.line,
            x.number ? `#${x.number}` : null,
            x.exclusivity,
            x.rarity,
          ]
            .filter(Boolean)
            .join(" "),
        );
        return tks.every((t) => hay.includes(t));
      });
    }

    if (rarity !== "all") {
      if (rarity === "chase") out = out.filter((x) => x.is_chase === true);
      else if (rarity === "exclusive")
        out = out.filter((x) => x.is_exclusive === true || (x.exclusivity ?? "").trim().length > 0);
      else out = out.filter((x) => (x.rarity ?? "").toLowerCase() === rarity);
    }

    const dir = order === "asc" ? 1 : -1;
    out = [...out].sort((a, b) => {
      if (sort === "name") {
        const A = (a.name ?? "").toLowerCase();
        const B = (b.name ?? "").toLowerCase();
        return A.localeCompare(B) * dir;
      }
      if (sort === "price") {
        const A = a.est_price_cents ?? -1;
        const B = b.est_price_cents ?? -1;
        return (A - B) * dir;
      }
      // release_year
      const A = a.release_year ?? -1;
      const B = b.release_year ?? -1;
      return (A - B) * dir;
    });

    return out;
  }, [items, q, rarity, sort, order]);

  if (!items.length) return null;

  return (
    <section className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
      <h2 className="text-lg font-semibold text-white">Related Funko</h2>
      <p className="mt-1 text-sm text-white/70">
        Search, filter, and sort within the same franchise/series — plus quick links for internal navigation.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-12">
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
          <label className="text-xs uppercase tracking-wide text-white/60">Filter</label>
          <select
            value={rarity}
            onChange={(e) => setRarity(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
          >
            <option value="all">All</option>
            <option value="chase">Chase</option>
            <option value="exclusive">Exclusive</option>
            <option value="rare">Rare (extra.rarity)</option>
            <option value="common">Common (extra.rarity)</option>
          </select>
        </div>

        <div className="md:col-span-3">
          <label className="text-xs uppercase tracking-wide text-white/60">Sort</label>
          <div className="mt-1 flex gap-2">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as any)}
              className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            >
              <option value="release_year">Release year</option>
              <option value="name">Name</option>
              <option value="price">Estimated price</option>
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
      </div>

      <div className="mt-4 text-xs text-white/60">
        Showing <span className="text-white/90">{filtered.length}</span> of {items.length}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {filtered.slice(0, 24).map((x) => {
          const img = x.image_large || x.image_small;
          const title = `${x.name ?? x.id}${x.number ? ` #${x.number}` : ""}`;
          const price = fmtMoneyCents(x.est_price_cents);
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
                    sizes="200px"
                  />
                ) : (
                  <div className="absolute inset-0 grid place-items-center text-xs text-white/60">No image</div>
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
            </Link>
          );
        })}
      </div>

      {filtered.length > 24 ? (
        <div className="mt-3 text-xs text-white/60">
          Tip: refine your search to narrow results (showing first 24).
        </div>
      ) : null}
    </section>
  );
}
