// src/lib/cf.ts

// Prefer NEXT_PUBLIC_* for browser usage
export const CF_ACCOUNT_HASH =
  process.env.NEXT_PUBLIC_CF_ACCOUNT_HASH ||
  process.env.NEXT_PUBLIC_CF_IMAGES_ACCOUNT_HASH ||
  process.env.CF_ACCOUNT_HASH ||
  "";

// Base domain only (no trailing slash)
export const CF_IMAGE_DELIVERY_BASE =
  (process.env.NEXT_PUBLIC_IMAGE_DELIVERY_BASE || "https://imagedelivery.net").replace(/\/$/, "");

// Exact variants you showed in your screenshot
export type Variant =
  | "background"
  | "card"
  | "careers"
  | "category"
  | "categoryThumb"
  | "hero"
  | "productHero"
  | "productThumb"
  | "public"
  | "saleCard"
  | "subcategoryThumb";

function looksLikeUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function normalizeImageId(input: string): string | null {
  const s = String(input).trim();
  if (!s) return null;

  // If someone stored a full Cloudflare Images URL, strip to the path after the domain:
  // https://imagedelivery.net/<acct>/<id>/<variant>
  const withoutDomain = s.replace(/^https?:\/\/imagedelivery\.net\//i, "");

  // Drop query/fragment
  const clean = withoutDomain.split(/[?#]/)[0];

  // If it starts with "<acct>/...", drop that first segment
  const parts = clean.split("/").filter(Boolean);

  // Possible shapes:
  // 1) "<id>"
  // 2) "<id>/<variant>"
  // 3) "<acct>/<id>/<variant>"
  // 4) "<acct>/<id>"
  if (parts.length === 0) return null;

  if (parts.length >= 2 && parts[0] === CF_ACCOUNT_HASH) {
    return parts[1] || null;
  }

  // Otherwise first segment is probably the image id
  return parts[0] || null;
}

/**
 * Returns a Cloudflare Images delivery URL:
 *   https://imagedelivery.net/<ACCOUNT_HASH>/<IMAGE_ID>/<VARIANT>
 *
 * Returns undefined if config is missing or the image id is invalid.
 */
export function cfUrl(
  id: string | null | undefined,
  variant: Variant = "public",
): string | undefined {
  if (!id) return undefined;
  if (!CF_ACCOUNT_HASH) return undefined;

  const imageId = normalizeImageId(id);
  if (!imageId) return undefined;

  // Guardrail: prevent accidentally using the account hash as the image id
  if (imageId === CF_ACCOUNT_HASH) return undefined;

  // Guardrail: only allow UUID-like ids (matches what Cloudflare image IDs look like in your project)
  if (!looksLikeUuid(imageId)) return undefined;

  return `${CF_IMAGE_DELIVERY_BASE}/${CF_ACCOUNT_HASH}/${imageId}/${variant}`;
}
