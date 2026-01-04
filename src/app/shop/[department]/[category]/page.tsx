// src/app/shop/[department]/[category]/page.tsx
import "server-only";

import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import AddToCartButton from "@/components/shop/AddToCartButton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DeptKey = "pokemon" | "yugioh" | "mtg" | "sports" | "accessories";

function norm(v: unknown) {
  const s = String(v ?? "").trim();
  try {
    return decodeURIComponent(s).trim().toLowerCase();
  } catch {
    return s.trim().toLowerCase();
  }
}

function dollars(cents: number) {
  const n = Number(cents ?? 0) / 100;
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function deptLabel(d: DeptKey) {
  switch (d) {
    case "pokemon":
      return "Pokémon";
    case "yugioh":
      return "Yu-Gi-Oh!";
    case "mtg":
      return "Magic: The Gathering";
    case "sports":
      return "Sports Cards";
    case "accessories":
      return "Accessories";
  }
}

type ApiQuery = {
  game?: "pokemon" | "yugioh" | "mtg" | "sports";
  format?: "single" | "pack" | "box" | "bundle" | "lot" | "accessory";
  sealed?: boolean;
  graded?: boolean;
};

function normalizeCategorySlug(raw: string): string {
  // Accept a bunch of friendly URLs and normalize to a stable set.
  // You can add more aliases as you create more categories.
  switch (raw) {
    case "single":
    case "singles":
      return "single";

    case "graded":
    case "slabs":
      return "graded";

    case "pack":
    case "packs":
      return "pack";

    case "box":
    case "boxes":
      return "box";

    case "bundle":
    case "bundles":
    case "etb":
    case "etbs":
      return "bundle";

    case "lot":
    case "lots":
      return "lot";

    case "accessory":
    case "accessories":
      return "accessory";

    case "all":
      return "all";

    default:
      return raw;
  }
}

function categoryToApi(
  dept: DeptKey,
  categoryRaw: string
): { label: string; api: ApiQuery } | null {
  const category = normalizeCategorySlug(categoryRaw);

  // Accessories department = accessories across *all* games
  if (dept === "accessories") {
    if (category === "all") return { label: "All Accessories", api: { format: "accessory" } };
    if (category === "accessory") return { label: "Accessories", api: { format: "accessory" } };
    return null;
  }

  // Game departments
  const game = dept;

  switch (category) {
    case "single":
      return { label: "Singles", api: { game, format: "single" } };

    case "graded":
      return { label: "Graded Singles", api: { game, format: "single", graded: true } };

    case "pack":
      return { label: "Booster Packs", api: { game, format: "pack", sealed: true } };

    case "box":
      return { label: "Booster Boxes", api: { game, format: "box", sealed: true } };

    case "bundle":
      return { label: "Bundles / ETBs", api: { game, format: "bundle", sealed: true } };

    case "accessory":
      return { label: "Accessories", api: { game, format: "accessory" } };

    default:
      return null;
  }
}

async function fetchShopProducts(
  api: ApiQuery,
  searchParams: Record<string, string | string[] | undefined>
) {
  const qs = new URLSearchParams();

  if (api.game) qs.set("game", api.game);
  if (api.format) qs.set("format", api.format);
  if (typeof api.sealed === "boolean") qs.set("sealed", api.sealed ? "true" : "false");
  if (typeof api.graded === "boolean") qs.set("graded", api.graded ? "true" : "false");

  // Pass-through a few supported query params (optional)
  const passthrough = [
    "q",
    "sort",
    "page",
    "limit",
    "priceMin",
    "priceMax",
    "grader",
    "gradeMin",
    "condition",
    "tag",
  ];
  for (const key of passthrough) {
    const v = searchParams[key];
    if (typeof v === "string" && v.trim()) qs.set(key, v.trim());
  }

  const base = (process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
  const url = `${base}/api/shop/products?${qs.toString()}`;

  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { items: [], total: 0, page: 1, limit: 24, _error: text.slice(0, 250) } as any;
  }

  return res.json() as Promise<{ items: any[]; total: number; page: number; limit: number }>;
}

export async function generateMetadata({
  params,
}: {
  params: { department: string; category: string };
}): Promise<Metadata> {
  const dept = norm(params.department) as DeptKey;
  const category = norm(params.category);

  const validDept =
    dept === "pokemon" || dept === "yugioh" || dept === "mtg" || dept === "sports" || dept === "accessories";
  if (!validDept) return { title: "Shop • Legendary Collectibles" };

  const cfg = categoryToApi(dept, category);
  if (!cfg) return { title: `Shop • ${deptLabel(dept)} • Legendary Collectibles` };

  return {
    title: `Shop • ${deptLabel(dept)} • ${cfg.label} • Legendary Collectibles`,
    description: `Browse ${cfg.label} in ${deptLabel(dept)}.`,
  };
}

export default async function ShopCategoryPage({
  params,
  searchParams,
}: {
  params: { department: string; category: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const dept = norm(params.department) as DeptKey;
  const category = norm(params.category);

  const validDept =
    dept === "pokemon" || dept === "yugioh" || dept === "mtg" || dept === "sports" || dept === "accessories";
  if (!validDept) return notFound();

  const cfg = categoryToApi(dept, category);
  if (!cfg) return notFound();

  const data = await fetchShopProducts(cfg.api, searchParams);

  const canonicalCategory = normalizeCategorySlug(category);

  return (
    <main className="shopShell">
      <header className="shopHeader">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="shopTitle">
              {deptLabel(dept)} / {cfg.label}
            </h1>
            <p className="shopSubtitle">{Number(data.total ?? 0).toLocaleString()} items</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link className="chip" href={`/shop/${dept}`}>
              ← Back
            </Link>
            <Link className="chip" href="/shop">
              All Departments
            </Link>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            className="chip"
            href={{ pathname: `/shop/${dept}/${canonicalCategory}`, query: { ...searchParams, sort: "new" } }}
          >
            Newest
          </Link>
          <Link
            className="chip"
            href={{ pathname: `/shop/${dept}/${canonicalCategory}`, query: { ...searchParams, sort: "price_asc" } }}
          >
            Price ↑
          </Link>
          <Link
            className="chip"
            href={{ pathname: `/shop/${dept}/${canonicalCategory}`, query: { ...searchParams, sort: "price_desc" } }}
          >
            Price ↓
          </Link>
        </div>
      </header>

      <section className="shopSection">
        {Number(data.total ?? 0) === 0 ? (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 text-white/80">
            No products found for this category yet.
            {(data as any)._error ? <div className="mt-3 text-xs text-white/50">API: {(data as any)._error}</div> : null}
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((p: any) => {
              const imgUrl = p?.image?.url || null;
              const imgAlt = p?.image?.alt || p?.title || "Product image";
              const href = `/product/${p.slug}`; // change if your product route differs

              return (
                <div key={p.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                  <Link href={href} className="block">
                    <div className="relative aspect-[4/3] bg-white/5">
                      {imgUrl ? (
                        <Image
                          src={imgUrl}
                          alt={imgAlt}
                          fill
                          sizes="(max-width: 1024px) 100vw, 33vw"
                          className="object-cover"
                          priority={false}
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-white/40 text-sm">
                          No image
                        </div>
                      )}
                    </div>
                  </Link>

                  <div className="p-5">
                    <div className="text-white font-semibold line-clamp-2">
                      <Link className="hover:underline" href={href}>
                        {p.title}
                      </Link>
                    </div>

                    {p.subtitle ? (
                      <div className="mt-2 text-white/70 text-sm line-clamp-2">{p.subtitle}</div>
                    ) : (
                      <div className="mt-2 text-white/50 text-sm">
                        {p.isGraded ? `Graded${p.grader ? ` • ${String(p.grader).toUpperCase()}` : ""}` : "Store item"}
                        {p.sealed ? " • Sealed" : ""}
                      </div>
                    )}

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <div className="text-white font-bold">{dollars(p.priceCents)}</div>
                      <div className="text-xs text-white/50">
                        {typeof p.quantity === "number"
                          ? p.quantity > 0
                            ? `${p.quantity} in stock`
                            : "Out of stock"
                          : ""}
                      </div>
                    </div>

                    <div className="mt-4 flex gap-2">
                      <Link
                        href={href}
                        className="flex-1 rounded-lg bg-white/10 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-white/15"
                      >
                        View
                      </Link>

                      <AddToCartButton productId={p.id} availableQty={p.quantity} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
