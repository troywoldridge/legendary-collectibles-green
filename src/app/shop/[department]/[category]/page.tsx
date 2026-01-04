// src/app/shop/[department]/[category]/page.tsx
import "server-only";

import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import AddToCartButton from "@/components/shop/AddToCartButton";
import {
  categoryToApi,
  getDepartmentConfig,
  normalizeCategorySlug,
  normalizeDepartmentSlug,
} from "@/lib/shop/catalog";
import { fetchShopProducts, formatCurrency } from "@/lib/shop/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { department: string; category: string };
}): Promise<Metadata> {
  const dept = normalizeDepartmentSlug(params.department);
  const category = normalizeCategorySlug(params.category);

  if (!dept) return { title: "Shop • Legendary Collectibles" };

  const deptCfg = getDepartmentConfig(dept);
  const cfg = category ? categoryToApi(dept, category) : null;
  if (!cfg || !deptCfg) return { title: `Shop • ${dept} • Legendary Collectibles` };

  return {
    title: `Shop • ${deptCfg.name} • ${cfg.label} • Legendary Collectibles`,
    description: `${cfg.label} from ${deptCfg.name}. Live inventory ready to ship.`,
  };
}

export default async function ShopCategoryPage({
  params,
  searchParams,
}: {
  params: { department: string; category: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const dept = normalizeDepartmentSlug(params.department);
  const category = normalizeCategorySlug(params.category);

  if (!dept || !category) return notFound();

  const deptCfg = getDepartmentConfig(dept);
  if (!deptCfg) return notFound();

  const cfg = categoryToApi(dept, category);
  if (!cfg) return notFound();

  const data = await fetchShopProducts(cfg.api, searchParams);
  const canonicalCategory = category;

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
          <span className="pill">{Number(data.total ?? 0).toLocaleString()} items</span>
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

        <div className="shopSortRow">
          <span className="sortLabel">Sort:</span>
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
          <div className="emptyState">
            <div className="emptyTitle">No products found yet.</div>
            <p className="emptySubtitle">Check back soon or try a different category.</p>
            {(data as any)._error ? <div className="emptyError">API: {(data as any)._error}</div> : null}
          </div>
        ) : (
          <div className="productMasonry">
            {data.items.map((p: any) => {
              const imgUrl = p?.image?.url || null;
              const imgAlt = p?.image?.alt || p?.title || "Product image";
              const href = `/products/${p.id}`;
              const badge = p?.isGraded
                ? p?.grader
                  ? `${String(p.grader).toUpperCase()} Slab`
                  : "GRADED"
                : p?.sealed
                  ? "SEALED"
                  : null;
              const hasCompare = p?.compareAtCents && Number(p.compareAtCents) > Number(p.priceCents);

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
                          className="object-cover"
                          priority={false}
                        />
                      ) : (
                        <div className="productTile__placeholder">No image</div>
                      )}
                    </div>
                    {badge ? <div className="productTile__badge">{badge}</div> : null}
                  </Link>

                  <div className="productTile__body">
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
                        <div className="productTile__compare">{formatCurrency(p.compareAtCents)}</div>
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
                      <AddToCartButton productId={p.id} availableQty={p.quantity} />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
