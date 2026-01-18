// src/app/shop/[department]/[category]/page.tsx
import "server-only";

import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import AddToCartButton from "@/components/shop/AddToCartButton";
import ShopFilters from "@/components/shop/ShopFilters";
import PaginationBar from "@/components/shop/PaginationBar";
import { buildImageAlt } from "@/lib/seo/imageAlt";

import {
  categoryToApi,
  getDepartmentConfig,
  normalizeCategorySlug,
  normalizeDepartmentSlug,
} from "@/lib/shop/catalog";
import { fetchShopProducts, formatCurrency, type ShopProduct } from "@/lib/shop/client";
import { site } from "@/config/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type Params = { department: string; category: string };
type SearchParams = Record<string, string | string[] | undefined>;

function norm(v: unknown) {
  return String(v ?? "").trim();
}

function asString(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

function toPosInt(v: unknown, fallback: number, max = 999999) {
  const n = Number(String(v ?? ""));
  if (!Number.isFinite(n)) return fallback;
  const m = Math.floor(n);
  if (m < 1) return fallback;
  if (m > max) return max;
  return m;
}

async function resolveSearchParams(v: unknown): Promise<SearchParams> {
  const maybePromise = v as any;
  if (maybePromise && typeof maybePromise.then === "function") return (await maybePromise) ?? {};
  return (v ?? {}) as SearchParams;
}

function buildQueryString(
  searchParams: Record<string, string | string[] | undefined>,
  patch: Record<string, string | null | undefined>,
) {
  const qs = new URLSearchParams();

  for (const [k, v] of Object.entries(searchParams)) {
    const val = asString(v).trim();
    if (val) qs.set(k, val);
  }

  for (const [k, v] of Object.entries(patch)) {
    if (v === null) qs.delete(k);
    else if (typeof v === "string" && v.trim()) qs.set(k, v.trim());
    else if (v === "") qs.delete(k);
  }

  return qs.toString();
}

function normalizeCloudflareVariant(url: string | null | undefined, variant = "productTile") {
  const u = String(url ?? "").trim();
  if (!u) return "";
  if (!u.includes("imagedelivery.net/")) return u;
  return u.replace(/\/[^/]+$/, `/${variant}`);
}

export async function generateMetadata(props: {
  params: Params | Promise<Params>;
}): Promise<Metadata> {
  const p = await props.params;
  const departmentRaw = norm(p?.department);
  const categoryRaw = norm(p?.category);

  const dept = normalizeDepartmentSlug(departmentRaw);
  const category = normalizeCategorySlug(categoryRaw);

  if (!dept || !category) {
    return { title: `Shop | ${site.name}`, robots: { index: true, follow: true } };
  }

  const deptCfg = getDepartmentConfig(dept);
  const cfg = categoryToApi(dept, category);

  const canonical = `${site.url}/shop/${encodeURIComponent(dept)}/${encodeURIComponent(category)}`;

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
  searchParams: SearchParams | Promise<SearchParams>;
}) {
  // ✅ This is the real fix for “URL changes but page stays the same”
  noStore();

  const params = await props.params;
  const sp = await resolveSearchParams(props.searchParams);

  const departmentRaw = norm(params?.department);
  const categoryRaw = norm(params?.category);

  const dept = normalizeDepartmentSlug(departmentRaw);
  const category = normalizeCategorySlug(categoryRaw);
  if (!dept || !category) notFound();

  const canonicalPath = `/shop/${dept}/${category}`;

  // Canonicalize casing/aliases, but KEEP query string
  const rawDeptLower = departmentRaw.toLowerCase();
  const rawCatLower = categoryRaw.toLowerCase();
  if (rawDeptLower !== dept || rawCatLower !== category) {
    const qs = buildQueryString(sp, {});
    redirect(qs ? `${canonicalPath}?${qs}` : canonicalPath);
  }

  const deptCfg = getDepartmentConfig(dept);
  if (!deptCfg) notFound();

  const cfg = categoryToApi(dept, category);
  if (!cfg) notFound();

  const page = toPosInt(asString(sp.page), 1);
  const limit = toPosInt(asString(sp.limit), 24, 48);

  const requestSearchParams: SearchParams = {
    ...sp,
    page: String(page),
    limit: String(limit),
  };

  // everything except page (used by PaginationBar)
  const baseQuery = buildQueryString(requestSearchParams, { page: null });

  const data = await fetchShopProducts(cfg.api, requestSearchParams);

  const total = Number(data.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, limit)));

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
          <Link className="chip" href={`/shop/${dept}`} prefetch={false}>
            ← Back to {deptCfg.name}
          </Link>
          <Link className="chip" href="/shop" prefetch={false}>
            All Departments
          </Link>
          <Link className="chip" href="/cart" prefetch={false}>
            Cart
          </Link>
        </div>

        <details className="shopFiltersDetails">
          <summary className="shopFiltersSummary">
            Filters <span className="shopFiltersSummaryHint">Search + refine</span>
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
            {"_error" in data && (data as any)._error ? (
              <div className="emptyError">API: {String((data as any)._error)}</div>
            ) : null}
          </div>
        ) : (
          <>
            <div className="productMasonry">
              {(data.items ?? []).map((product: ShopProduct) => {
                const rawImgUrl = product.image?.url ?? null;

                const imgAlt = buildImageAlt({
                  title: product.title,
                  subtitle: product.subtitle ?? null,
                  game: dept,
                  setName: (product as any)?.setName ?? (product as any)?.set?.name ?? null,
                  cardNumber: (product as any)?.number ?? null,
                  condition: product.condition ?? null,
                  isGraded: product.isGraded ?? null,
                  grader: product.grader ?? null,
                  grade: (product as any)?.gradeLabel ?? product.gradeX10 ?? null,
                  sealed: product.sealed ?? null,
                });

                const imgUrl = normalizeCloudflareVariant(rawImgUrl, "productTile") || rawImgUrl || "";
                const href = `/products/${product.id}`;

                const badge = product.isGraded
                  ? product.grader
                    ? `${String(product.grader).toUpperCase()} Slab`
                    : "GRADED"
                  : product.sealed
                    ? "SEALED"
                    : null;

                const hasCompare =
                  product.compareAtCents != null &&
                  Number(product.compareAtCents) > 0 &&
                  Number(product.compareAtCents) > Number(product.priceCents);

                return (
                  <article key={product.id} className="productTile">
                    <Link href={href} className="productTile__media" prefetch={false}>
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
                        <Link className="hover:underline" href={href} prefetch={false}>
                          {product.title}
                        </Link>
                      </div>

                      <div className="productTile__subtitle">
                        {product.subtitle ??
                          (product.isGraded
                            ? `Graded${product.grader ? ` • ${String(product.grader).toUpperCase()}` : ""}`
                            : "In stock and ready to ship")}
                      </div>

                      <div className="productTile__priceRow">
                        <div className="productTile__price">{formatCurrency(product.priceCents)}</div>
                        {hasCompare ? (
                          <div className="productTile__compare">
                            {formatCurrency(product.compareAtCents as number)}
                          </div>
                        ) : null}
                      </div>

                      <div className="productTile__meta">
                        {typeof product.quantity === "number"
                          ? product.quantity > 0
                            ? `${product.quantity} in stock`
                            : "Out of stock"
                          : "Live inventory"}
                      </div>

                      <div className="productTile__actions">
                        <Link href={href} className="btn btnGhost btnInline" prefetch={false}>
                          View
                        </Link>
                        <AddToCartButton productId={product.id} availableQty={product.quantity ?? undefined} />
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <PaginationBar
              canonicalPath={canonicalPath}
              page={page}
              totalPages={totalPages}
              baseQuery={baseQuery}
              backHref={`/shop/${dept}`}
            />
          </>
        )}
      </section>
    </main>
  );
}
