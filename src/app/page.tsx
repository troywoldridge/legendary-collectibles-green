/* eslint-disable @typescript-eslint/no-unused-vars */
// src/app/(site)/page.tsx
import "server-only";

import Link from "next/link";
import Image from "next/image";
import Script from "next/script";
import { db } from "@/lib/db";
import { products, productImages } from "@/lib/db/schema/shop";
import { desc, inArray, sql } from "drizzle-orm";
import { CF_ACCOUNT_HASH } from "@/lib/cf";

/* ---------------- Types ---------------- */
type FeaturedItem = {
  title: string;
  tag: string;
  price: string;
  href: string;
  imageUrl?: string;
  alt?: string;
};

type CategoryTile = {
  key: string;
  label: string;
  href: string;
  cfId: string; // can be a CF image id OR a full https URL (see tileImageSrc)
  alt?: string;
};

/* ---------------- UI constants ---------------- */
export const dynamic = "force-dynamic";

const BRANDS = ["Pokémon", "Yu-Gi-Oh!", "Magic: The Gathering", "One Piece", "Dragon Ball"] as const;

const FALLBACK_IMG =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

/* ---------------- Helpers ---------------- */
const fmtUSD = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format((cents || 0) / 100);

const cfImageUrl = (id: string, variant = "categoryThumb") =>
  `https://imagedelivery.net/${CF_ACCOUNT_HASH}/${id}/${variant}`;

function tileImageSrc(cfIdOrUrl: string): string {
  // If you pass a full Cloudflare delivery URL (or any URL), use it as-is.
  if (/^https?:\/\//i.test(cfIdOrUrl)) return cfIdOrUrl;
  // Otherwise treat it as a CF image id and build the delivery URL for category tiles.
  return cfImageUrl(cfIdOrUrl, "categoryThumb");
}

/**
 * If a URL is a Cloudflare Images delivery URL, replace its final segment (variant) with the one we want.
 * Example:
 *  https://imagedelivery.net/<acct>/<imageId>/productCard  ->  .../featuredDrop
 */
function forceCfVariant(url: string | undefined, variant: string): string | undefined {
  if (!url) return url;
  const m = url.match(/^(https:\/\/imagedelivery\.net\/[^/]+\/[^/]+)\/([^/?#]+)/);
  if (!m) return url;
  return `${m[1]}/${variant}`;
}

/* ---------------- Queries ---------------- */
async function getFeaturedItems(): Promise<FeaturedItem[]> {
  try {
    const rows = await db
      .select({
        id: products.id,
        title: products.title,
        slug: products.slug,
        priceCents: products.priceCents,
        updatedAt: products.updatedAt,
      })
      .from(products)
      .where(
        sql`${products.status} = 'active' AND (${products.inventoryType} != 'stock' OR ${products.quantity} > 0)`,
      )
      .orderBy(desc(products.updatedAt))
      .limit(10);

    const ids = rows.map((r) => r.id);

    // Primary images (lowest sort per product)
    const imgMap = new Map<string, { url: string; alt: string | null }>();
    if (ids.length) {
      const imgs = await db
        .select({
          productId: productImages.productId,
          url: productImages.url,
          alt: productImages.alt,
          sort: productImages.sort,
        })
        .from(productImages)
        .where(inArray(productImages.productId, ids))
        .orderBy(productImages.productId, productImages.sort);

      for (const im of imgs) {
        if (!imgMap.has(im.productId)) {
          imgMap.set(im.productId, { url: im.url, alt: im.alt ?? null });
        }
      }
    }

    return rows.map((p) => {
      const img = imgMap.get(p.id);

      // Force the variant for featured carousel.
      // Create a CF Images variant named "featuredDrop" (portrait crop).
      const forcedUrl = forceCfVariant(img?.url, "featuredDrop");

      return {
        title: p.title ?? "Untitled Product",
        tag: "Featured",
        price: fmtUSD(p.priceCents ?? 0),
        href: `/product/${p.slug}`,
        imageUrl: forcedUrl ?? img?.url,
        alt: img?.alt ?? p.title ?? "Product image",
      };
    });
  } catch (err) {
    console.error("[home] featured query failed:", err);
    return [];
  }
}

/* ---------------- Page ---------------- */
export default async function HomePage() {
  const FEATURED_ITEMS = await getFeaturedItems();

  // Home tiles: your “category” entry points (static; no categories table)
  const TILES: CategoryTile[] = [
    {
      key: "pokemon",
      label: "Pokémon",
      href: "/categories/pokemon/sets",
      cfId: "eb1a8f57-bd66-4203-fb59-32749ee3e500",
      alt: "Pokémon category",
    },
    {
      key: "yugioh",
      label: "Yu-Gi-Oh!",
      href: "/categories/yugioh/sets",
      cfId: "87101a20-6ada-4b66-0057-2d210feb9d00",
      alt: "Yu-Gi-Oh! category",
    },
    {
      key: "mtg",
      label: "Magic: The Gathering",
      href: "/categories/mtg/sets",
      cfId: "69ab5d2b-407c-4538-3c82-be8a551efa00",
      alt: "Magic: The Gathering category",
    },
    {
      key: "funko",
      label: "Funko",
      href: "/categories/funko/items",
      // Full CF Images delivery URL (use as-is)
      cfId: "https://imagedelivery.net/pJ0fKvjCAbyoF8aD0BGu8Q/15e8fcec-eaee-4cd9-89a7-e16ab4d45e00/productTile",
      alt: "Funko category",
    },
  ];

  return (
    <>
      {/* Inject verification meta for Impact */}
      <Script
        id="impact-meta-inject"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            try {
              var m = document.createElement('meta');
              m.setAttribute('name','impact-site-verification');
              m.setAttribute('value','23da3329-2871-4e21-bb5b-3d78b104da54');
              document.head.appendChild(m);
            } catch (e) {}
          `,
        }}
      />

      {/* Impact stat tag */}
      <Script
        id="impact-stat"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{
          __html:
            `(function(i,m,p,a,c,t){c.ire_o=p;c[p]=c[p]||function(){(c[p].a=c[p].a||[]).push(arguments)};t=a.createElement(m);var z=a.getElementsByTagName(m)[0];t.async=1;t.src=i;z.parentNode.insertBefore(t,z)})('https://utt.impactcdn.com/P-A6677953-2a49-4282-8c11-738fb5fc4f5e1.js','script','impactStat',document,window);impactStat('transformLinks');impactStat('trackImpression');`,
        }}
      />

      <main className="min-h-screen">
        <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8">
          {/* HERO */}
          <section className="relative" aria-labelledby="hero-title">
            <div className="mx-auto w-full max-w-[1100px] px-4 sm:px-0">
              <div className="flex min-h-[55vh] items-center justify-center py-10 sm:py-14">
                <div className="mx-auto w-full max-w-[900px] space-y-6 text-center sm:space-y-8 lg:space-y-10">
                  <p className="mb-2 text-4xl font-semibold tracking-wide text-white/85 drop-shadow-[0_1px_2px_rgba(0,0,0,.6)]">
                    WELCOME TO LEGENDARY COLLECTIBLES
                  </p>

                  <h1
                    id="hero-title"
                    className="mb-3 text-4xl font-extrabold leading-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,.45)] sm:text-5xl"
                  >
                    Rip, trade, and collect{" "}
                    <span className="underline decoration-4 underline-offset-4">Legendary</span> cards
                  </h1>

                  <p className="mb-2 text-2xl font-semibold tracking-wide text-white/85 drop-shadow-[0_1px_2px_rgba(0,0,0,.6)]">
                    Sealed heat, graded grails, and weekly drops—curated for real collectors. Fast shipping. Authenticity guaranteed.
                  </p>

                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <Link
                      href="/shop"
                      className="inline-flex items-center rounded-lg border border-white/70 bg-indigo-600/80 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm hover:bg-indigo-600"
                    >
                      Shop Listings
                    </Link>

                    {/* You do not currently have a /categories index page; send to /shop to avoid 404 */}
                    <Link
                      href="/shop"
                      className="inline-flex items-center rounded-lg border border-white/60 bg-white/5 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm hover:bg-white/10"
                    >
                      Browse Categories
                    </Link>

                    <Link
                      href="/search"
                      className="inline-flex items-center rounded-lg border border-white/50 bg-white/5 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm hover:bg-white/10"
                    >
                      Search the Vault
                    </Link>

                    <Link
                      href="/cart"
                      className="inline-flex items-center rounded-lg border border-white/50 bg-white/5 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm hover:bg-white/10"
                    >
                      View Cart
                    </Link>

                    <Link
                      href="/categories/pokemon/cards"
                      className="inline-flex items-center rounded-lg border border-white/50 bg-white/5 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm hover:bg-white/10"
                    >
                      Pokémon Cards
                    </Link>
                  </div>

                  {/* Brand chips */}
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    {BRANDS.map((b) => (
                      <Link
                        key={b}
                        href={`/search?q=${encodeURIComponent(b)}`}
                        className="rounded-full border border-white/30 bg-white/5 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur-sm hover:bg-white/10"
                      >
                        {b}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* SHOP BY CATEGORY */}
          <section className="mt-8 sm:mt-10 lg:mt-12" aria-labelledby="shop-by-category">
            <div className="mb-3 text-center">
              <h2
                id="shop-by-category"
                className="text-2xl font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,.6)] sm:text-3xl"
              >
                Shop by Category
              </h2>

              <p className="mt-1 text-2xl text-white/85 drop-shadow-[0_1px_1px_rgba(0,0,0,.6)]">
                Find sealed product, singles, slabs, and figures by game or line.
              </p>

              {/* Avoid /categories (no index page currently) */}
              <Link
                href="/shop"
                className="text-sm font-semibold text-white/90 underline underline-offset-4 hover:text-white"
              >
                View all →
              </Link>

              <div className="mt-2 flex items-center justify-center gap-4">
                <Link
                  href="/shop"
                  className="text-sm font-semibold text-white/90 underline underline-offset-4 hover:text-white"
                >
                  Shop listings →
                </Link>
              </div>
            </div>

            <div className="mx-auto max-w-4xl">
              <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {TILES.map((t) => {
                  const src = tileImageSrc(t.cfId);
                  return (
                    <li
                      key={t.key}
                      className="overflow-hidden rounded-xl border border-white/10 bg-white/5 transition hover:border-white/20 hover:bg-white/10"
                    >
                      <Link href={t.href} className="block">
                        <div className="relative w-full" style={{ aspectRatio: "4 / 3" }}>
                          <Image
                            src={src}
                            alt={t.alt ?? t.label}
                            fill
                            unoptimized
                            priority={t.key === "pokemon"}
                            className="object-cover"
                            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 25vw"
                          />
                        </div>

                        <div className="p-3">
                          <div className="text-sm font-semibold text-white">{t.label}</div>
                          <div className="text-xs text-white/75">Shop now →</div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>

          {/* FEATURED DROPS */}
          <section className="mt-10 sm:mt-12 lg:mt-14" aria-labelledby="featured-drops">
            <div className="mb-4 text-center">
              <h2
                id="featured-drops"
                className="text-2xl font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,.6)] sm:text-3xl"
              >
                🔥 Featured Drops
              </h2>

              <Link
                href="/drops"
                className="text-sm font-semibold text-white/90 underline underline-offset-4 hover:text-white"
              >
                See all →
              </Link>
            </div>

            <div className="relative">
              <div className="flex snap-x gap-4 overflow-x-auto pb-2">
                {(FEATURED_ITEMS.length ? FEATURED_ITEMS : []).map((item, idx) => {
                  const src = item.imageUrl ? item.imageUrl : FALLBACK_IMG;
                  return (
                    <article
                      key={`${item.href}-${idx}`}
                      className="snap-start w-[280px] shrink-0 overflow-hidden rounded-xl border border-white/20 bg-white/5 shadow-[0_8px_20px_rgba(0,0,0,.25)] backdrop-blur-sm transition hover:bg-white/10 hover:border-white/30"
                    >
                      <div className="relative aspect-[3/4] w-full bg-black/20 p-2">
                        <Image
                          src={src}
                          alt={item.alt ?? item.title}
                          fill
                          className="object-contain"
                          sizes="280px"
                          priority={false}
                          unoptimized
                        />
                      </div>

                      <div className="p-3">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="rounded border border-white/30 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/90">
                            {(item.tag || "").toUpperCase()}
                          </span>
                        </div>

                        <Link href={item.href} className="line-clamp-2 font-semibold text-white hover:underline">
                          {item.title}
                        </Link>

                        <div className="mt-1 text-sm font-semibold text-white/90">{item.price}</div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>

          {/* EMAIL CAPTURE */}
          <section className="my-10 sm:my-12 lg:my-14">
            <div className="overflow-hidden rounded-2xl border border-white/20 bg-white/5 p-5 text-white shadow-[0_8px_20px_rgba(0,0,0,.25)] backdrop-blur-sm ring-0 sm:p-6 lg:p-7">
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold drop-shadow-[0_1px_2px_rgba(0,0,0,.6)]">
                    Get first dibs on restocks & drops
                  </h3>
                  <p className="text-sm text-white/85 drop-shadow-[0_1px_2px_rgba(0,0,0,.6)]">
                    No spam. Just heat.
                  </p>
                </div>

                <form className="flex w-full max-w-md items-center gap-2" action="/newsletter" method="post">
                  <input
                    type="email"
                    name="email"
                    required
                    placeholder="you@trainer.club"
                    className="w-full rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/70 outline-none backdrop-blur focus:ring-2 focus:ring-white/60"
                  />
                  <button
                    type="submit"
                    className="shrink-0 rounded-lg border border-white/60 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/60"
                  >
                    Notify me
                  </button>
                </form>
              </div>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
