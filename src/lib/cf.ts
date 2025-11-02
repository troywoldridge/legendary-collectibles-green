// src/lib/cf.ts
export const CF_ACCOUNT_HASH =
  process.env.NEXT_PUBLIC_CF_ACCOUNT_HASH ||
  process.env.CF_ACCOUNT_HASH ||
  "";

const BASE =
  (process.env.NEXT_PUBLIC_IMAGE_DELIVERY_BASE || "").replace(/\/$/, "") ||
  (CF_ACCOUNT_HASH ? `https://imagedelivery.net/${CF_ACCOUNT_HASH}` : "");

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

export function cfUrl(
  id: string | null | undefined,
  variant: Variant = "public"
): string | undefined {
  if (!id || !BASE) return undefined;

  const s = String(id).trim();

  // Remove protocol + domain + account hash if present
  const afterHash = s.replace(/^https?:\/\/imagedelivery\.net\/[^/]+\//i, "");

  // Drop query/fragment
  const cleanPath = afterHash.split(/[?#]/)[0];

  // Take only the first segment (image ID). If someone stored "id/public", we keep just "id".
  const imageId = cleanPath.split("/")[0];

  if (!imageId) return undefined;
  return `${BASE}/${imageId}/${variant}`;
}
