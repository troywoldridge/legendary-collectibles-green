// src/lib/images.ts
import { cfUrl, type Variant } from "@/lib/cf";

/** Minimal shape we need to build the best image URL for a card */
export type CardImageSources = {
  cf_image_small_id?: string | null;
  cf_image_large_id?: string | null;
  image_small?: string | null; // e.g. images.pokemontcg.io/.../small.png
  image_large?: string | null; // e.g. images.pokemontcg.io/.../large.png
};

/** Pick the best image: prefer Cloudflare IDs, then fall back to external urls */
export function cardImgUrl(
  src: CardImageSources,
  variant: Variant = "productHero"
): string | null {
  // Prefer a large CF image, then small CF, then external large, then external small
  const cfLarge = src.cf_image_large_id ? cfUrl(src.cf_image_large_id, variant) : null;
  if (cfLarge) return cfLarge;

  const cfSmall = src.cf_image_small_id ? cfUrl(src.cf_image_small_id, variant) : null;
  if (cfSmall) return cfSmall;

  if (src.image_large) return src.image_large;
  if (src.image_small) return src.image_small;

  return null;
}

/** Nice default alt text for card pages */
export function cardAlt(card: { name?: string | null; number?: string | null; set_name?: string | null }): string {
  const bits = [
    card.name ?? "Card",
    card.number ? `#${card.number}` : null,
    card.set_name ? `(${card.set_name})` : null,
  ].filter(Boolean);
  return String(bits.join(" "));
}
