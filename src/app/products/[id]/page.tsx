// src/app/products/[id]/page.tsx
import "server-only";

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import AddToCartWithQty from "@/app/shop/_components/AddToCartWithQty";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function norm(s: unknown) {
  return String(s ?? "").trim();
}

/**
 * IMPORTANT:
 * - Never fall back to localhost for public SEO URLs.
 * - Default to your real production domain if env is missing.
 */
function getPublicBaseUrl(): string {
  const envBase =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
    process.env.SITE_URL?.replace(/\/+$/, "");

  // Hard default to production domain to avoid localhost canonicals in prod crawls
  return envBase || "https://legendary-collectibles.com";
}

type ApiProduct = {
  id: string;
  slug?: string | null;
  sku?: string | null;

  title: string;
  subtitle?: string | null;
  description?: string | null;

  game?: string | null;     // now returned as text in API
  format?: string | null;   // text
  sealed?: boolean | null;

  is_graded?: boolean | null;
  grader?: string | null;   // text
  grade_x10?: number | null;

  condition?: string | null; // text

  price_cents?: number | null;
  compare_at_cents?: number | null;

  quantity?: number | null;
  status?: string | null;    // text

  // ✅ SEO enrichment (from your DB schema)
  card_kind?: string | null;        // monster/spell/trap (yugioh)
  source_card_id?: string | null;   // e.g. swsh9-175, xy7-56, etc
  source_set_code?: string | null;  // e.g. swsh9, xy7, sv4
  source_number?: string | null;    // e.g. "175", "56", "026"
  source_set_name?: string | null;  // e.g. Brilliant Stars

  // optional commerce details (nice later)
  shipping_class?: string | null;
  shipping_weight_lbs?: string | number | null;

  image_url?: string | null;
  images?: { url: string; alt?: string | null; sort?: number | null }[];
};


async function fetchProduct(id: string): Promise<ApiProduct | null> {
  const base = getPublicBaseUrl();
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
  if (!Number.isFinite(cents)) return null;
  return (cents / 100).toFixed(2);
}

function normalizeCloudflareVariant(
  url: string | null | undefined,
  variant = "productTile",
) {
  const u = String(url ?? "").trim();
  if (!u) return u;
  if (!u.includes("imagedelivery.net/")) return u;
  return u.replace(/\/[^/]+$/, `/${variant}`);
}

function brandName(game?: string | null) {
  const g = String(game ?? "").toLowerCase();
  if (g === "pokemon") return "Pokémon";
  if (g === "yugioh") return "Yu-Gi-Oh!";
  if (g === "mtg") return "Magic: The Gathering";
  if (g === "sports") return "Sports Cards";
  return "Legendary Collectibles";
}

function conditionUrl(cond?: string | null) {
  const c = String(cond ?? "").toLowerCase();

  if (c === "nm" || c === "near mint" || c === "new") {
    return "https://schema.org/NewCondition";
  }
  if (c === "dmg" || c === "damaged") {
    return "https://schema.org/DamagedCondition";
  }
  return "https://schema.org/UsedCondition";
}

/**
 * Build a nice, keyword-forward title and description.
 */
function fmtGame(g?: string | null) {
  const v = String(g ?? "").toLowerCase();
  if (!v) return "";
  if (v === "pokemon") return "Pokémon";
  if (v === "yugioh") return "Yu-Gi-Oh!";
  if (v === "mtg") return "MTG";
  if (v === "sports") return "Sports Cards";
  return v.charAt(0).toUpperCase() + v.slice(1);
}

function fmtCondition(c?: string | null) {
  const v = String(c ?? "").trim();
  if (!v) return "";
  // Normalize common abbreviations
  const lc = v.toLowerCase();
  if (lc === "nm") return "NM";
  if (lc === "lp") return "LP";
  if (lc === "mp") return "MP";
  if (lc === "hp") return "HP";
  if (lc === "dmg") return "DMG";
  return v.toUpperCase();
}

function fmtSet(p: ApiProduct) {
  const name = String(p.source_set_name ?? "").trim();
  const code = String(p.source_set_code ?? "").trim();
  if (name && code) return `${name} (${code.toUpperCase()})`;
  if (name) return name;
  if (code) return code.toUpperCase();
  return "";
}

function fmtNumber(p: ApiProduct) {
  const n = String(p.source_number ?? "").trim();
  if (!n) return "";
  // Keep leading zeros (e.g. 026)
  return `#${n}`;
}

function fmtGrade(p: ApiProduct) {
  if (!p.is_graded) return "";
  const g = String(p.grader ?? "").trim();
  const score =
    typeof p.grade_x10 === "number" && Number.isFinite(p.grade_x10)
      ? (p.grade_x10 / 10).toFixed(1).replace(/\.0$/, "")
      : "";
  if (g && score) return `${g} ${score}`;
  if (g) return g;
  if (score) return `Grade ${score}`;
  return "Graded";
}

function fmtFormat(p: ApiProduct) {
  const f = String(p.format ?? "").trim();
  if (!f) return "";
  // Your enum values might be like: single, pack, box, bundle, etc.
  // Title-case it nicely
  return f
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Max SEO title:
 * - Leads with product title (most important)
 * - Adds set/name/number when available (collector intent)
 * - Adds graded or condition
 * - Adds format + game when useful
 * - Ends with brand
 *
 * Keeps it readable and avoids stuffing.
 */
function seoTitle(p: ApiProduct) {
  const parts: string[] = [];

  // Main entity
  parts.push(p.title);

  // Collector identifiers (great for long-tail)
  const set = fmtSet(p);
  const num = fmtNumber(p);

  // Prefer showing # in title; set can be included if it exists
  if (num) parts.push(num);
  if (set) parts.push(set);

  // Graded > Condition
  const grade = fmtGrade(p);
  if (grade) parts.push(grade);
  else {
    const cond = fmtCondition(p.condition);
    if (cond) parts.push(cond);
  }

  // Format/game signals
  const format = fmtFormat(p);
  const game = fmtGame(p.game);
  if (format) parts.push(format);
  if (game) parts.push(game);

  // Final title
  const raw = `${parts.join(" – ")} | Legendary Collectibles`;

  // Keep reasonable length (soft trim)
  return raw.length > 70 ? raw.slice(0, 67).trimEnd() + "…" : raw;
}

/**
 * Max SEO description:
 * - Purchase intent (“Buy …”)
 * - Mentions set/number, condition/grade, sealed, format, and shipping promise
 * - Adds a short snippet from your description if present
 */
function seoDescription(p: ApiProduct) {
  const game = fmtGame(p.game);
  const format = fmtFormat(p);
  const set = fmtSet(p);
  const num = fmtNumber(p);
  const cond = fmtCondition(p.condition);
  const grade = fmtGrade(p);

  const sealed = p.sealed ? "Sealed product. " : "";
  const stockLine =
    typeof p.quantity === "number"
      ? p.quantity > 0
        ? `In stock: ${p.quantity}. `
        : "Currently out of stock. "
      : "";

  const idBits: string[] = [];
  if (set) idBits.push(set);
  if (num) idBits.push(num);
  const ids = idBits.length ? ` (${idBits.join(", ")})` : "";

  const qual =
    grade ? `Graded: ${grade}. ` : cond ? `Condition: ${cond}. ` : "";

  const formatBits =
    format || game
      ? `${format ? format : ""}${format && game ? " " : ""}${game ? game : ""}. `
      : "";

  const ship = "Fast, secure shipping and collector-safe packaging.";
  const base = `Buy ${p.title}${ids}. ${formatBits}${qual}${sealed}${stockLine}${ship}`;

  const desc =
    (p.description ? String(p.description).replace(/\s+/g, " ").trim() : "") || "";

  const combined = desc ? `${base} ${desc}` : base;

  // Keep within typical meta snippet window
  return combined.slice(0, 300);
}

/**
 * ✅ Metadata: titles, description, canonical, OG/Twitter, robots.
 * DB/API-driven and safe for crawlers (no localhost canonicals).
 */
export async function generateMetadata(props: {
  params: { id: string } | Promise<{ id: string }>;
}): Promise<Metadata> {
  const p = await props.params;
  const id = norm(p?.id);
  if (!id) return {};

  const product = await fetchProduct(id);
  if (!product) {
    return {
      title: "Product not found | Legendary Collectibles",
      description: "This product could not be found.",
      robots: { index: false, follow: true },
    };
  }

  const base = getPublicBaseUrl();

  // ✅ Canonical must point to a real, working URL for THIS route.
  // Your page route is /products/[id], so canonicalize to the product.id URL.
  const canonical = `${base}/products/${encodeURIComponent(product.id)}`;

  // Prefer explicit images[]; fall back to image_url
  const images =
    Array.isArray(product.images) && product.images.length > 0
      ? product.images
      : product.image_url
        ? [{ url: product.image_url, alt: product.title, sort: 0 }]
        : [];

  // Use a higher-quality variant for social previews when possible
  const ogImageRaw = images[0]?.url ?? "";
  const ogImage =
    (normalizeCloudflareVariant(ogImageRaw, "productDetail") || ogImageRaw || "")
      .trim() || undefined;

  const title = seoTitle(product);
  const description = seoDescription(product);

  // Status-based indexing rules
  const status = String(product.status ?? "").toLowerCase();
  const unavailableByStatus = status === "inactive" || status === "disabled";

  // Stock status (can influence snippets)
  const qty = typeof product.quantity === "number" ? product.quantity : null;
  const soldOut =
    (qty !== null && qty <= 0) || status === "sold" || status === "sold_out";

  // Price (optional meta tags for social platforms)
  const priceText = money(product.price_cents);

  // ✅ Rich keywords for OG/Twitter titles are fine, but keep the browser title clean
  // (Your seoTitle() already handles this pattern well.)
  const ogTitle = title;
  const ogDescription = description;

  return {
    title,
    description,

    alternates: {
      canonical,
    },

    robots: unavailableByStatus
      ? { index: false, follow: true }
      : { index: true, follow: true },

    openGraph: {
      // Next.js Metadata typing doesn't support "product" here, so use "website"
      type: "website",
      url: canonical,
      title: ogTitle,
      description: ogDescription,
      siteName: "Legendary Collectibles",
      images: ogImage ? [{ url: ogImage, alt: product.title }] : undefined,
    },

    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title: ogTitle,
      description: ogDescription,
      images: ogImage ? [ogImage] : undefined,
    },

    // ✅ Extra meta tags (Next-safe) that some platforms read.
    // Google ranking doesn't depend on these, but they can help rich previews.
    other: {
      // product-ish OpenGraph fields
      ...(priceText ? { "product:price:amount": priceText } : {}),
      "product:price:currency": "USD",
      "product:availability": soldOut ? "out of stock" : "in stock",

      // Helpful safety signals / consistency
      "application-name": "Legendary Collectibles",
    },
  };
}

export default async function ProductDetailPage(props: {
  params: { id: string } | Promise<{ id: string }>;
}) {
  const p = await props.params;
  const id = norm(p?.id);
  if (!id) notFound();

  const product = await fetchProduct(id);
  if (!product) notFound();

  const priceText = money(product.price_cents);
  const compareAtText = money(product.compare_at_cents);

  const images =
    Array.isArray(product.images) && product.images.length > 0
      ? product.images
      : product.image_url
        ? [{ url: product.image_url, alt: product.title, sort: 0 }]
        : [];

  const mainImageRaw = images[0]?.url ?? "";
  const mainImage =
    normalizeCloudflareVariant(mainImageRaw, "productDetail") || mainImageRaw;

  const thumbImages = images.map((im) => ({
    ...im,
    url: normalizeCloudflareVariant(im.url, "productTile") || im.url,
  }));

  const qty = typeof product.quantity === "number" ? product.quantity : null;
  const status = (product.status ?? "").toLowerCase();

  const hasPrice =
    typeof product.price_cents === "number" &&
    Number.isFinite(product.price_cents) &&
    product.price_cents > 0;

  const soldOut =
    (qty !== null && qty <= 0) || status === "sold" || status === "sold_out";

  const unavailableByStatus = status === "inactive" || status === "disabled";

  const addDisabled = !hasPrice || soldOut || unavailableByStatus;

  const lowStock = qty !== null && qty > 0 && qty <= 3;

  // Canonical URL MUST match generateMetadata()
  const base = getPublicBaseUrl();
  const canonical = `${base}/products/${encodeURIComponent(product.id)}`;

  const includeJsonLd = hasPrice;

  const productJsonLd = includeJsonLd
    ? {
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.title,
        description: product.description || undefined,
        image: thumbImages
          .map((im) => String(im.url || "").trim())
          .filter(Boolean),
        sku: product.sku || undefined,
        brand: {
          "@type": "Brand",
          name: brandName(product.game ?? null),
        },
        offers: {
          "@type": "Offer",
          url: canonical,
          priceCurrency: "USD",
          price: String(priceText),
          availability: soldOut
            ? "https://schema.org/OutOfStock"
            : "https://schema.org/InStock",
          itemCondition: conditionUrl(product.condition ?? null),
          seller: {
            "@type": "Organization",
            name: "Legendary Collectibles",
          },
        },
      }
    : null;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 text-white">
      {productJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
        />
      ) : null}

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

          {thumbImages.length > 1 ? (
            <div className="mt-3 grid grid-cols-5 gap-2">
              {thumbImages.slice(0, 10).map((im, i) => (
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
            {priceText ? (
              <div className="text-3xl font-extrabold">${priceText}</div>
            ) : (
              <div className="text-3xl font-extrabold">—</div>
            )}
            {compareAtText && compareAtText !== priceText ? (
              <div className="text-lg text-white/50 line-through">
                ${compareAtText}
              </div>
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

                          {product.source_set_name || product.source_set_code ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                  {product.source_set_name ?? String(product.source_set_code).toUpperCase()}
                  {product.source_set_code && product.source_set_name
                    ? ` (${String(product.source_set_code).toUpperCase()})`
                    : null}
                </span>
              ) : null}

              {product.source_number ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                  #{product.source_number}
                </span>
              ) : null}


              {product.sku ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                  SKU: {product.sku}
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

            {soldOut ? (
              <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 font-semibold text-red-200">
                Sold Out
              </span>
            ) : typeof product.quantity === "number" ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                In Stock: {product.quantity}
              </span>
            ) : null}

            {lowStock ? (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 font-semibold text-amber-200">
                Only {qty} left
              </span>
            ) : null}
          </div>

          <AddToCartWithQty
            productId={product.id}
            availableQty={product.quantity ?? null}
            disabled={addDisabled}
          />

          {!hasPrice ? (
            <p className="mt-2 text-sm text-white/60">
              This item isn’t purchasable yet (no price set).
            </p>
          ) : null}

          {unavailableByStatus ? (
            <p className="mt-2 text-sm text-white/60">
              This item is currently unavailable.
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
