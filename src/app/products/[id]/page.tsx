import "server-only";

import { notFound } from "next/navigation";
import AddToCartButton from "@/components/cart/AddToCartButton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function norm(s: unknown) {
  return String(s ?? "").trim();
}

function getBaseUrl(): string {
  const envBase =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
    process.env.SITE_URL?.replace(/\/+$/, "");
  return envBase || "http://127.0.0.1:3001";
}

type ApiProduct = {
  id: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;

  game?: string | null;
  format?: string | null;
  sealed?: boolean | null;

  is_graded?: boolean | null;
  grader?: string | null;
  grade_x10?: number | null;

  condition?: string | null;

  price_cents?: number | null;
  compare_at_cents?: number | null;

  quantity?: number | null;
  status?: string | null;

  image_url?: string | null;
  images?: { url: string; alt?: string | null; sort?: number | null }[];
};

async function fetchProduct(id: string): Promise<ApiProduct | null> {
  const base = getBaseUrl();
  const url = new URL(`/api/products/${encodeURIComponent(id)}`, base);

  const res = await fetch(url.toString(), { cache: "no-store" });

  if (res.status === 404) return null;
  if (!res.ok) {
    console.error("[products/[id]] api error", res.status, await res.text());
    return null;
  }

  const data = await res.json().catch(() => null);
  if (!data) return null;

  return (data.item ?? data.product ?? data) as ApiProduct;
}

function money(cents?: number | null) {
  if (typeof cents !== "number") return null;
  return (cents / 100).toFixed(2);
}

export default async function ProductDetailPage(props: {
  params: { id: string } | Promise<{ id: string }>;
}) {
  const p = await props.params; // ✅ works for both object and Promise params
  const id = norm(p?.id);
  if (!id) notFound();

  const product = await fetchProduct(id);
  if (!product) notFound();

  const price = money(product.price_cents);
  const compareAt = money(product.compare_at_cents);

  const images =
    Array.isArray(product.images) && product.images.length > 0
      ? product.images
      : product.image_url
        ? [{ url: product.image_url, alt: product.title, sort: 0 }]
        : [];

  const mainImage = images[0]?.url ?? "";

  const qty = typeof product.quantity === "number" ? product.quantity : null;
  const status = (product.status ?? "").toLowerCase();
  const unavailableByStatus =
    status === "sold" ||
    status === "sold_out" ||
    status === "inactive" ||
    status === "disabled";

  const addDisabled = !price || (qty !== null && qty <= 0) || unavailableByStatus;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 text-white">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div>
          <div className="aspect-[3/4] w-full overflow-hidden rounded-2xl border border-white/10 bg-black/30">
            {mainImage ? (
              <img
                src={mainImage}
                alt={product.title}
                className="h-full w-full object-contain"
                loading="eager"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-white/60">
                No image
              </div>
            )}
          </div>

          {images.length > 1 ? (
            <div className="mt-3 grid grid-cols-5 gap-2">
              {images.slice(0, 10).map((im, i) => (
                <div
                  key={`${im.url}-${i}`}
                  className="aspect-square overflow-hidden rounded-xl border border-white/10 bg-black/30"
                >
                  <img
                    src={im.url}
                    alt={im.alt ?? product.title}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div>
          <h1 className="text-3xl font-bold">{product.title}</h1>
          {product.subtitle ? (
            <p className="mt-2 text-white/70">{product.subtitle}</p>
          ) : null}

          <div className="mt-4 flex items-end gap-3">
            {price ? (
              <div className="text-3xl font-extrabold">${price}</div>
            ) : (
              <div className="text-3xl font-extrabold">—</div>
            )}
            {compareAt && compareAt !== price ? (
              <div className="text-lg text-white/50 line-through">${compareAt}</div>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            {product.game ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                {product.game}
              </span>
            ) : null}
            {product.format ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                {product.format}
              </span>
            ) : null}
            {product.condition ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                {product.condition}
              </span>
            ) : null}
            {product.is_graded ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                {product.grader ?? "Graded"}{" "}
                {typeof product.grade_x10 === "number"
                  ? (product.grade_x10 / 10).toFixed(1)
                  : ""}
              </span>
            ) : null}
            {typeof product.quantity === "number" ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                Qty: {product.quantity}
              </span>
            ) : null}
          </div>

          <AddToCartButton productId={product.id} disabled={addDisabled} />

          {!price ? (
            <p className="mt-2 text-sm text-white/60">
              This item isn’t purchasable yet (no price set).
            </p>
          ) : null}

          {product.description ? (
            <div className="mt-8">
              <h2 className="text-lg font-semibold">Description</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-white/70">
                {product.description}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
