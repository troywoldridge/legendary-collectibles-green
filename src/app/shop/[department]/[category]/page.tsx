/* eslint-disable @typescript-eslint/no-unused-vars */
// src/app/shop/[department]/[category]/page.tsx
import "server-only";

import Link from "next/link";
import Image from "next/image";
import { unstable_noStore as noStore } from "next/cache";

import {
  fetchShopProducts,
  formatCurrency,
  type ShopApiQuery,
  type ShopFormat,
  type ShopGame,
  type ShopProduct,
} from "@/lib/shop/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function s(v: unknown): string {
  return String(v ?? "").trim();
}

function toInt(v: unknown, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

/**
 * IMPORTANT:
 * We intentionally treat "collectibles" as a SHOP DEPARTMENT even if it isn't a "game" enum.
 * It is a computed bucket (everything NOT pokemon/yugioh/mtg/funko).
 */
type ShopDepartment = ShopGame | "collectibles";

function isShopDepartment(v: string): v is ShopDepartment {
  return (
    v === "pokemon" ||
    v === "yugioh" ||
    v === "mtg" ||
    v === "sports" ||
    v === "funko" ||
    v === "collectibles"
  );
}

function isShopFormat(v: string): v is ShopFormat {
  return (
    v === "single" ||
    v === "pack" ||
    v === "box" ||
    v === "bundle" ||
    v === "lot" ||
    v === "accessory"
  );
}

function normalizeImageCandidate(v: unknown): { url: string; alt?: string | null } | null {
  if (!v) return null;

  if (typeof v === "string") {
    const url = s(v);
    return url ? { url } : null;
  }

  if (typeof v === "object") {
    const url = s((v as any).url);
    if (!url) return null;
    const alt = (v as any).alt;
    return { url, alt: alt == null ? null : s(alt) || null };
  }

  return null;
}

function pickImage(p: ShopProduct): { url: string; alt: string } | null {
  const imgs = (p as any).images ?? null;
  if (Array.isArray(imgs) && imgs.length) {
    for (const c of imgs) {
      const picked = normalizeImageCandidate(c);
      if (picked?.url) return { url: picked.url, alt: picked.alt ?? p.title };
    }
  }

  const legacy = normalizeImageCandidate((p as any).image);
  if (legacy?.url) return { url: legacy.url, alt: legacy.alt ?? p.title };

  return null;
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ department: string; category: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  noStore();

  const p = await params;
  const sp = (await searchParams) ?? {};

  const departmentRaw = s(p.department).toLowerCase();
  const categoryRaw = s(p.category).toLowerCase();

  const q = Array.isArray(sp.q) ? s(sp.q[0]) : s(sp.q);
  const page = Math.max(1, toInt(Array.isArray(sp.page) ? sp.page[0] : sp.page, 1));
  const limit = Math.min(
    60,
    Math.max(1, toInt(Array.isArray(sp.limit) ? sp.limit[0] : sp.limit, 24)),
  );

  const department: ShopDepartment | undefined = isShopDepartment(departmentRaw)
    ? departmentRaw
    : undefined;

  const format: ShopFormat | undefined =
    categoryRaw && categoryRaw !== "all" && isShopFormat(categoryRaw) ? categoryRaw : undefined;

  // Build query
  const query: ShopApiQuery = {
    ...(department ? { game: department as any } : {}), // "collectibles" is a special bucket supported by API
    ...(format ? { format } : {}),
    ...(q ? { q } : {}),
    page,
    limit,
  };

  const res = await fetchShopProducts(query);

  // Title/subtitle by department
  const title =
    department === "pokemon"
      ? "Shop Pokémon"
      : department === "yugioh"
        ? "Shop Yu-Gi-Oh!"
        : department === "mtg"
          ? "Shop Magic: The Gathering"
          : department === "funko"
            ? "Shop Funko"
            : department === "sports"
              ? "Shop Sports"
              : department === "collectibles"
                ? "Shop Figures & Collectibles"
                : "Shop";

  const subtitle =
    department === "collectibles"
      ? "Figures & collectibles that are not Pokémon, Yu-Gi-Oh!, MTG, or Funko."
      : "Browse listings across the store.";

  if (!res.ok) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-10">
        <h1 className="text-2xl font-semibold text-white">{title}</h1>
        <p className="mt-2 text-sm text-white/70">{subtitle}</p>

        <div className="mt-6 rounded-2xl border border-white/15 bg-white/5 p-4 text-sm text-white/80">
          <div className="font-medium">Shop feed error</div>
          <div className="mt-1 text-white/70">{res.message || res.error}</div>
        </div>
      </main>
    );
  }

  const items = res.items ?? [];

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <div className="rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-sm">
        <div className="text-xs uppercase tracking-wide text-white/60">Shop</div>
        <h1 className="mt-2 text-2xl font-semibold text-white">{title}</h1>
        <p className="mt-2 text-sm text-white/70">{subtitle}</p>

        <div className="mt-4 text-xs text-white/60">
          Showing <span className="text-white">{items.length}</span> of{" "}
          <span className="text-white">{res.total}</span>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-white/15 bg-white/5 p-4 text-sm text-white/70">
          No items found in this category yet.
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((prod: ShopProduct) => {
            const img = pickImage(prod);

            const qty = Number((prod as any).quantity ?? 0);
            const showQty = Number.isFinite(qty);

            return (
              <Link
                key={(prod as any).id}
                href={`/products/${encodeURIComponent((prod as any).slug)}`}
                className="group overflow-hidden rounded-2xl border border-white/15 bg-white/5 backdrop-blur-sm hover:border-white/25"
              >
                <div className="relative aspect-[3/4] w-full overflow-hidden bg-black/25 p-3">
                  <div className="relative h-full w-full overflow-hidden rounded-xl border border-white/10 bg-black/30">
                    {img ? (
                      <Image
                        src={img.url}
                        alt={img.alt}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-contain transition-transform duration-300 group-hover:scale-[1.01]"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-white/40">
                        No image
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-4">
                  <div className="line-clamp-2 text-sm font-medium text-white">
                    {(prod as any).title}
                  </div>

                  <div className="mt-2 flex items-baseline gap-2">
                    <div className="text-sm font-semibold text-white">
                      {formatCurrency(Number((prod as any).priceCents || 0))}
                    </div>

                    {(prod as any).compareAtCents != null &&
                    Number((prod as any).compareAtCents) > Number((prod as any).priceCents || 0) ? (
                      <div className="text-xs text-white/50 line-through">
                        {formatCurrency(Number((prod as any).compareAtCents))}
                      </div>
                    ) : null}
                  </div>

                  {showQty ? (
                    <div className="mt-2 text-xs text-white/60">
                      Qty: <span className="text-white/80">{qty}</span>
                    </div>
                  ) : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-10 flex items-center justify-between">
        <Link
          className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10"
          href={`/shop/${encodeURIComponent(departmentRaw)}/${encodeURIComponent(
            categoryRaw,
          )}?page=${Math.max(1, page - 1)}&limit=${limit}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
        >
          ← Prev
        </Link>

        <div className="text-xs text-white/60">
          Page <span className="text-white/80">{res.page}</span>
        </div>

        <Link
          className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10"
          href={`/shop/${encodeURIComponent(departmentRaw)}/${encodeURIComponent(
            categoryRaw,
          )}?page=${page + 1}&limit=${limit}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
        >
          Next →
        </Link>
      </div>
    </main>
  );
}
