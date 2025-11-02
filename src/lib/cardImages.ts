// src/lib/cardImages.ts
import { cfUrl } from "@/lib/cf";

/** Reuse cfUrl’s second param type (the variant union) without importing a separate type. */
type CfVariant = NonNullable<Parameters<typeof cfUrl>[1]>;

type CardImageSources = {
  cf_image_small_id?: string | null;
  cf_image_large_id?: string | null;
  small_image?: string | null; // direct HTTP url (e.g., TCG API)
  large_image?: string | null; // direct HTTP url
};

/** Pick the best image. Prefer Cloudflare IDs with variants, then raw URLs, then a 1×1 fallback. */
export function pickCardImage(
  srcs: CardImageSources,
  preferred: CfVariant = "productHero" as CfVariant
): string {
  const ids = [srcs.cf_image_large_id, srcs.cf_image_small_id].filter(Boolean) as string[];
  const variantOrder: CfVariant[] = [...new Set([preferred, "hero" as CfVariant, "card" as CfVariant, "public" as CfVariant])];

  for (const id of ids) {
    for (const v of variantOrder) {
      const u = cfUrl(id, v);
      if (u) return u;
    }
  }
  if (srcs.large_image) return srcs.large_image;
  if (srcs.small_image) return srcs.small_image;

  // final transparent pixel (avoids 404s)
  return "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
}

/** Alt text helper */
export function cardAlt(name?: string | null, number?: string | null): string {
  const n = (name ?? "").trim() || "Card";
  const num = (number ?? "").trim();
  return num ? `${n} #${num}` : n;
}
