// src/app/shop/[department]/[category]/page.tsx
import "server-only";

import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";

import AddToCartButton from "@/components/shop/AddToCartButton";
import ShopFilters from "@/components/shop/ShopFilters";
import { buildImageAlt } from "@/lib/seo/imageAlt";

import {
  categoryToApi,
  getDepartmentConfig,
  normalizeCategorySlug,
  normalizeDepartmentSlug,
} from "@/lib/shop/catalog";
import { fetchShopProducts, formatCurrency } from "@/lib/shop/client";
import { site } from "@/config/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { department: string; category: string };
type SearchParams = Record<string, string | string[] | undefined>;

function norm(s: unknown) {
  return String(s ?? "").trim();
}

function asString(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

function buildQueryString(
  searchParams: Record<string, string | string[] | undefined>,
  patch: Record<string, string | null | undefined>,
) {
  const qs = new URLSearchParams();

  // keep existing
  for (const [k, v] of Object.entries(searchParams)) {
    const val = asString(v).trim();
    if (val) qs.set(k, val);
  }

  // apply patch
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) qs.delete(k);
    else if (typeof v === "string" && v.trim()) qs.set(k, v.trim());
    else if (v === "") qs.delete(k);
  }

  return qs.toString();
}

/**
 * Normalize Cloudflare Images variant.
 * Your "bad" tiles are coming through as .../public.
 * This forces them to render using a consistent tile variant.
 */
function normalizeCloudflareVariant(
  url: string | null | undefined,
  variant = "productTile",
) {
  const u = String(url ?? "").trim();
  if (!u) return u;

  // Only touch Cloudflare Image Delivery URLs
  if (!u.includes("imagedelivery.net/")) return u;

  // Replace the last path segment (variant) with the variant we want
  return u.replace(/\/[^/]+$/, `/${variant}`);
}

export async function generateMetadata(props: {
  params: Params | Promise<Params>;
}): Promise<Metadata> {
  const p = await props.params;
  const department = norm(p?.department);
  const categoryParam = norm(p?.category);

  const dept = normalizeDepartmentSlug(department);
  const category = normalizeCategorySlug(categoryParam);

  if (!dept || !category) {
    return {
      title: `Shop | ${site.name}`,
      robots: { index: true, follow: true },
    };
  }

  const deptCfg = getDepartmentConfig(dept);
  const cfg = categoryToApi(dept, category);

  const canonical = `${site.url}/shop/${encodeURIComponent(dept)}/${encodeURIComponent(
    category,
  )}`;

  if (!deptCfg || !cfg) {
    return {
      title: `Shop | ${site.name}`,
      robots: { index: true, follow: true },
      alternates: { canonical },
    };
  }

  return {
    title: `Shop • ${deptCfg.name} • ${cfg.label} | ${site.name}`,
    description: `${cfg.label} from ${deptCfg.name}. Live inventory ready to ship.`,
    alternates: { canonical },
  };
}

export default async function ShopCategoryPage(props: {
  params: Params | Promise<Params>;
  searchParams: SearchParams;
}) {
  const p = await props.params;

  const department = norm(p?.department);
  const categoryParam = norm(p?.category);

  const dept = normalizeDepartmentSlug(department);
  const category = normalizeCategorySlug(categoryParam);

  if (!dept || !category) notFound();

  // Canonicalize aliases + casing: /shop/yugi/single -> /shop/yugioh/singles
  const rawDept = department.toLowerCase();
  const rawCat = categoryParam.toLowerCase();

  if (rawDept !== dept || rawCat !== category) {
    redirect(`/shop/${dept}/${category}`);
  }

  const deptCfg = getDepartmentConfig(dept);
  if (!deptCfg) notFound();

  const cfg = categoryToApi(dept, category);
  if (!cfg) notFound();

  const data = await fetchShopProducts(cfg.api, props.searchParams);

  const page = Number(asString(props.searchParams.page) || data.page || 1) || 1;
  const limit = Number(asString(props.searchParams.limit) || data.limit || 24) || 24;
  const total = Number(data.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, limit)));

  const canonicalPath = `/shop/${dept}/${category}`;

  return (
    <main className="shopShell shopShell--wide">
      <header className="shopHeader">
        <div className="eyebrow">{deptCfg.hero.eyebrow}</div>

        <h1 className="shopTitle">
          {deptCfg.name} / {cfg.label}
        </h1>

        <p className="shopSubtitle">{deptCfg.description}</p>
        {deptCfg.hero.accent ? <p className="shopAccent">{deptCfg.hero.accent}</p> : null}

        <div className="shopMeta">
          <span className="pill">{total.toLocaleString()} items</span>
          <span className="pill pillGhost">Fast shipping · Secure packaging</span>
          <span className="pill pillGhost">Safe checkout</span>
        </div>

        <div className="chipRow">
          <Link className="chip" href={`/shop/${dept}`}>
            ← Back to {deptCfg.name}
          </Link>
          <Link className="chip" href="/shop">
            All Departments
          </Link>
          <Link className="chip" href="/cart">
            Cart
          </Link>
        </div>

        {/* Filters (client component) */}
        <details className="shopFiltersDetails">
          <summary className="shopFiltersSummary">
            Filters
            <span className="shopFiltersSummaryHint">Search + refine</span>
          </summary>

          <div className="shopFiltersPanel">
            <ShopFilters game={dept} format={category} />
          </div>
        </details>
      </header>

      <section className="shopSection">
        {total === 0 ? (
          <div className="emptyState">
            <div className="emptyTitle">No products found.</div>
            <p className="emptySubtitle">Try clearing filters or picking a different category.</p>
            {data._error ? <div className="emptyError">API: {data._error}</div> : null}
          </div>
        ) : (
          <>
            <div className="productMasonry">
              {data.items.map((pItem) => {
                const p = pItem as any;

                const rawImgUrl: string | null = p?.image?.url || null;
                const imgAlt = buildImageAlt({
                  title: p?.title,
                  subtitle: p?.subtitle,
                  game: dept,                 // dept is already pokemon/yugioh/mtg
                  setName: p?.setName ?? p?.set?.name ?? null,
                  cardNumber: p?.number ?? null,
                  condition: p?.condition ?? null,
                  isGraded: p?.isGraded ?? null,
                  grader: p?.grader ?? null,
                  grade: p?.gradeLabel ?? p?.grade ?? null,
                  sealed: p?.sealed ?? null,
                });

                // ✅ Normalize Cloudflare variant for tile rendering
                // This specifically fixes tcg_cards that are stored as .../public
                const imgUrl = normalizeCloudflareVariant(rawImgUrl, "productTile") || rawImgUrl;

                // ✅ IMPORTANT: your product detail route is /products/[id] (UUID)
                const href = `/products/${p.id}`;

                const badge = p?.isGraded
                  ? p?.grader
                    ? `${String(p.grader).toUpperCase()} Slab`
                    : "GRADED"
                  : p?.sealed
                    ? "SEALED"
                    : null;

                const hasCompare =
                  p?.compareAtCents != null &&
                  Number(p.compareAtCents) > 0 &&
                  Number(p.compareAtCents) > Number(p.priceCents);

                return (
                  <article key={p.id} className="productTile">
                    <Link href={href} className="productTile__media">
                      <div className="productTile__imgWrap">
                        {imgUrl ? (
                          <Image
                            src={imgUrl}
                            alt={imgAlt}
                            fill
                            sizes="(max-width: 1024px) 100vw, 33vw"
                            className="productTile__img"
                            priority={false}
                          />
                        ) : (
                          <div className="productTile__placeholder">No image</div>
                        )}
                      </div>
                      {badge ? <div className="productTile__badge">{badge}</div> : null}
                    </Link>

                    <div className="productTile__body productTile__body--tight">
                      <div className="productTile__title">
                        <Link className="hover:underline" href={href}>
                          {p.title}
                        </Link>
                      </div>

                      <div className="productTile__subtitle">
                        {p.subtitle ??
                          (p.isGraded
                            ? `Graded${p.grader ? ` • ${String(p.grader).toUpperCase()}` : ""}`
                            : "In stock and ready to ship")}
                      </div>

                      <div className="productTile__priceRow">
                        <div className="productTile__price">{formatCurrency(p.priceCents)}</div>
                        {hasCompare ? (
                          <div className="productTile__compare">
                            {formatCurrency(p.compareAtCents as number)}
                          </div>
                        ) : null}
                      </div>

                      <div className="productTile__meta">
                        {typeof p.quantity === "number"
                          ? p.quantity > 0
                            ? `${p.quantity} in stock`
                            : "Out of stock"
                          : "Live inventory"}
                      </div>

                      <div className="productTile__actions">
                        <Link href={href} className="btn btnGhost btnInline">
                          View
                        </Link>
                        <AddToCartButton productId={p.id} availableQty={p.quantity ?? undefined} />
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            {/* Pagination */}
            <div className="pagerRow">
              <div className="pagerInfo">
                Page {page} / {totalPages}
              </div>

              <div className="pagerBtns">
                {page > 1 ? (
                  <Link
                    className="pagerBtn"
                    href={`${canonicalPath}?${buildQueryString(props.searchParams, {
                      page: String(page - 1),
                    })}`}
                  >
                    ← Prev
                  </Link>
                ) : null}

                {page < totalPages ? (
                  <Link
                    className="pagerBtn"
                    href={`${canonicalPath}?${buildQueryString(props.searchParams, {
                      page: String(page + 1),
                    })}`}
                  >
                    Next →
                  </Link>
                ) : null}
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
