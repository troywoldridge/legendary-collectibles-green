// src/app/store/page.tsx
import "server-only";
import Link from "next/link";
import Image from "next/image";
import { db } from "@/lib/db/index";
import { products, productImages } from "@/lib/db/schema/shop";
import { and, asc, desc, eq, inArray, gt, sql } from "drizzle-orm";
import AddToCartButton from "@/app/store/AddToCartButton";

export const dynamic = "force-dynamic";

const FALLBACK_IMG =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

const fmtUSD = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);

const GAMES = [
  { key: "all", label: "All" },
  { key: "pokemon", label: "Pokémon" },
  { key: "yugioh", label: "Yu-Gi-Oh!" },
  { key: "mtg", label: "MTG" },
  { key: "funko", label: "Funko" },
] as const;

type SearchParams = {
  game?: string;
  showAll?: string; // if "1", includes qty=0
};

// Swap Cloudflare Images variant at end of URL
function toVariantUrl(url: string, variant: string) {
  const parts = url.split("/");
  if (parts.length < 2) return url;
  parts[parts.length - 1] = variant;
  return parts.join("/");
}

export default async function StorePage({ searchParams }: { searchParams?: SearchParams }) {
  const game = (searchParams?.game || "all").toLowerCase();
  const showAll = searchParams?.showAll === "1";

  const whereParts: any[] = [eq(products.status, "active")];

  // default = only in-stock
  if (!showAll) whereParts.push(gt(products.quantity, 0));

  // filter by game (optional)
  if (game !== "all") {
    whereParts.push(sql`${products.game} = ${game}`);
  }

  const rows = await db
    .select({
      id: products.id,
      title: products.title,
      slug: products.slug,
      game: products.game,
      format: products.format,
      sealed: products.sealed,
      isGraded: products.isGraded,
      grader: products.grader,
      gradeX10: products.gradeX10,
      condition: products.condition,
      priceCents: products.priceCents,
      compareAtCents: products.compareAtCents,
      quantity: products.quantity,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .where(and(...whereParts))
    .orderBy(desc(products.updatedAt))
    .limit(60);

  const productIds = rows.map((r) => r.id);

  // Pull primary images (lowest sort) for all shown products
  const imgs = productIds.length
    ? await db
        .select({
          productId: productImages.productId,
          url: productImages.url,
          alt: productImages.alt,
          sort: productImages.sort,
        })
        .from(productImages)
        .where(inArray(productImages.productId, productIds))
        .orderBy(asc(productImages.productId), asc(productImages.sort))
    : [];

  const imageByProductId = new Map<string, { url: string; alt: string | null }>();
  for (const img of imgs) {
    if (!imageByProductId.has(img.productId)) {
      imageByProductId.set(img.productId, { url: img.url, alt: img.alt ?? null });
    }
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold text-white">Shop</h1>
            <p className="mt-1 text-white/80">Singles, slabs, and sealed — live inventory.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {GAMES.map((g) => {
              const active = g.key === game;
              const href =
                g.key === "all"
                  ? `/store${showAll ? "?showAll=1" : ""}`
                  : `/store?game=${encodeURIComponent(g.key)}${showAll ? "&showAll=1" : ""}`;

              return (
                <Link
                  key={g.key}
                  href={href}
                  className={
                    active
                      ? "rounded-full border border-white/40 bg-white/15 px-3 py-1 text-xs font-semibold text-white"
                      : "rounded-full border border-white/25 bg-white/5 px-3 py-1 text-xs font-semibold text-white/90 hover:bg-white/10"
                  }
                >
                  {g.label}
                </Link>
              );
            })}

            <Link
              href={
                showAll
                  ? (game === "all" ? "/store" : `/store?game=${encodeURIComponent(game)}`)
                  : (game === "all" ? "/store?showAll=1" : `/store?game=${encodeURIComponent(game)}&showAll=1`)
              }
              className="ml-2 rounded-lg border border-white/25 bg-white/5 px-3 py-1 text-xs font-semibold text-white/90 hover:bg-white/10"
              title={showAll ? "Hide out of stock" : "Show out of stock"}
            >
              {showAll ? "Hide OOS" : "Show OOS"}
            </Link>
          </div>
        </div>

        {/* Empty state */}
        {rows.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-white/15 bg-white/5 p-8 text-center">
            <div className="text-xl font-semibold text-white">No active listings yet.</div>
            <p className="mt-2 text-white/80">
              If you just seeded products, make sure <span className="font-semibold">quantity &gt; 0</span>.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/"
                className="rounded-lg border border-white/30 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                Back Home
              </Link>
              <Link
                href="/cart"
                className="rounded-lg border border-white/40 bg-indigo-600/80 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600"
              >
                View Cart
              </Link>
            </div>
          </div>
        ) : (
          <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {rows.map((p) => {
              const img = imageByProductId.get(p.id);

              // ✅ Use Cloudflare "grid" variant in the shop
              const imgUrl = img?.url ? toVariantUrl(img.url, "grid") : FALLBACK_IMG;

              const isOos = Number(p.quantity ?? 0) <= 0;

              return (
                <li
                  key={p.id}
                  className="overflow-hidden rounded-2xl border border-white/15 bg-white/5 hover:border-white/25 hover:bg-white/10 transition"
                >
                  <Link href={`/products/${p.id}`} className="block">
                    {/* ✅ TCG-friendly card shape */}
                    <div className="relative aspect-[3/4] w-full bg-black/40 overflow-hidden">
                      <Image
                        src={imgUrl}
                        alt={img?.alt ?? p.title}
                        fill
                        className="object-contain p-2"
                        unoptimized
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      />

                      {p.sealed ? (
                        <div className="absolute left-2 top-2 rounded-full border border-white/30 bg-black/40 px-2 py-1 text-[10px] font-bold text-white">
                          SEALED
                        </div>
                      ) : null}

                      {p.isGraded ? (
                        <div className="absolute right-2 top-2 rounded-full border border-white/30 bg-black/40 px-2 py-1 text-[10px] font-bold text-white">
                          {p.grader ? String(p.grader).toUpperCase() : "GRADED"}
                          {p.gradeX10 ? ` • ${p.gradeX10}/10` : ""}
                        </div>
                      ) : null}

                      {isOos ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/55">
                          <span className="rounded-full border border-white/30 bg-black/40 px-3 py-1 text-xs font-extrabold text-white">
                            OUT OF STOCK
                          </span>
                        </div>
                      ) : null}
                    </div>

                    <div className="p-3">
                      <div className="line-clamp-2 text-sm font-semibold text-white">{p.title}</div>

                      <div className="mt-2 flex items-end justify-between gap-2">
                        <div>
                          <div className="text-sm font-extrabold text-white">{fmtUSD(Number(p.priceCents ?? 0))}</div>
                          {p.compareAtCents ? (
                            <div className="text-xs text-white/60 line-through">{fmtUSD(Number(p.compareAtCents))}</div>
                          ) : (
                            <div className="text-xs text-white/60">&nbsp;</div>
                          )}
                        </div>

                        <div className="text-[10px] text-white/70 text-right">
                          <div>{String(p.game).toUpperCase()}</div>
                          <div>{String(p.format).toUpperCase()}</div>
                        </div>
                      </div>
                    </div>
                  </Link>

                  <div className="px-3 pb-3">
                    <AddToCartButton productId={p.id} disabled={isOos} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
