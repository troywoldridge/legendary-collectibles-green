// src/app/products/[id]/page.tsx
import "server-only";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { products, productImages } from "@/lib/db/schema/shop";
import { eq, asc } from "drizzle-orm";
import AddToCartButton from "@/app/store/AddToCartButton";
import QtyPicker from "@/app/products/[id]/QtyPicker";
import BuyNowButton from "@/app/products/[id]/BuyNowButton";

export const dynamic = "force-dynamic";

const fmtUSD = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);

// Swap Cloudflare Images variant at end of URL
function toVariantUrl(url: string, variant: string) {
  const parts = url.split("/");
  if (parts.length < 2) return url;
  parts[parts.length - 1] = variant;
  return parts.join("/");
}

export default async function ProductPage({ params }: { params: { id: string } }) {
  const product = await db.select().from(products).where(eq(products.id, params.id)).limit(1);
  if (!product.length) return notFound();
  const p = product[0];

  const images = await db
    .select()
    .from(productImages)
    .where(eq(productImages.productId, p.id))
    .orderBy(asc(productImages.sort));

  const mainImg = images[0] ?? null;

  // ✅ Use "card" variant for product detail hero image
  const mainUrl = mainImg?.url ? toVariantUrl(mainImg.url, "card") : null;

  const available = Number(p.quantity ?? 0);
  const isOos = available <= 0;

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-[1100px] px-4 py-10">
        <Link href="/store" className="text-sm text-white/70 hover:text-white underline underline-offset-4">
          ← Back to shop
        </Link>

        <div className="mt-6 grid grid-cols-1 gap-8 md:grid-cols-2">
          {/* IMAGE */}
          <div className="rounded-2xl border border-white/15 bg-black/40 p-4">
            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-black/40">
              {mainUrl ? (
                <Image
                  src={mainUrl}
                  alt={mainImg?.alt ?? p.title}
                  fill
                  className="object-contain"
                  unoptimized
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-white/60">
                  No image
                </div>
              )}
            </div>

            {/* Thumbnails (if multiple images) */}
            {images.length > 1 ? (
              <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                {images.slice(0, 10).map((img, idx) => {
                  const thumbUrl = img.url ? toVariantUrl(img.url, "grid") : null;
                  if (!thumbUrl) return null;
                  return (
                    <div
                      key={`${img.productId}-${idx}`}
                      className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-white/15 bg-white/5"
                      title={img.alt ?? p.title}
                    >
                      <Image
                        src={thumbUrl}
                        alt={img.alt ?? p.title}
                        fill
                        className="object-contain p-1"
                        unoptimized
                        sizes="64px"
                      />
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          {/* DETAILS */}
          <div>
            <h1 className="text-3xl font-extrabold text-white">{p.title}</h1>

            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-white">
                {String(p.game).toUpperCase()}
              </span>
              <span className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-white">
                {String(p.format).toUpperCase()}
              </span>
              {p.sealed ? (
                <span className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-white">
                  SEALED
                </span>
              ) : null}
              {p.isGraded ? (
                <span className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-white">
                  {p.grader ? String(p.grader).toUpperCase() : "GRADED"}
                  {p.gradeX10 ? ` • ${p.gradeX10}/10` : ""}
                </span>
              ) : null}
              {p.condition ? (
                <span className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-white">
                  {String(p.condition).toUpperCase()}
                </span>
              ) : null}
            </div>

            <div className="mt-4">
              <div className="text-3xl font-extrabold text-white">{fmtUSD(Number(p.priceCents ?? 0))}</div>
              {p.compareAtCents ? (
                <div className="text-sm text-white/60 line-through">{fmtUSD(Number(p.compareAtCents))}</div>
              ) : null}
            </div>

            <div className="mt-4 text-sm text-white/70">
              {isOos ? "Out of stock" : `In stock: ${available}`}
            </div>

            {/* Quantity + actions */}
            <div className="mt-6 max-w-sm space-y-3">
              <QtyPicker max={Math.max(1, available)} disabled={isOos} />

              {/* AddToCartButton updated to accept quantity via data attribute */}
              <AddToCartButton productId={p.id} disabled={isOos} />

              <BuyNowButton productId={p.id} disabled={isOos} />
            </div>

            {p.description ? (
              <div className="mt-6 text-sm text-white/80 whitespace-pre-line">{p.description}</div>
            ) : (
              <div className="mt-6 text-sm text-white/60">
                No description yet. (We can auto-generate these from set/card metadata later.)
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
