export type ShippingRateTier = { upToLbs: number; cents: number };

export const USPS_GROUND_ADVANTAGE_TIERS: ShippingRateTier[] = [
  { upToLbs: 0.30, cents: 447 },  // singles/packs
  { upToLbs: 0.60, cents: 475 },  // graded
  { upToLbs: 1.00, cents: 599 },  // accessories / small box-ish
  { upToLbs: 2.00, cents: 975 },  // ETB / bundles
  { upToLbs: 3.00, cents: 1035 }, // booster boxes
  { upToLbs: 5.00, cents: 1399 }, // multi-item
  { upToLbs: 9999, cents: 1999 }, // safety net
];

export function baseShippingCentsForWeight(weightLbs: number): number {
  const w = Math.max(0, Number(weightLbs) || 0);
  for (const tier of USPS_GROUND_ADVANTAGE_TIERS) {
    if (w <= tier.upToLbs) return tier.cents;
  }
  return USPS_GROUND_ADVANTAGE_TIERS[USPS_GROUND_ADVANTAGE_TIERS.length - 1].cents;
}
