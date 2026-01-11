export function insuranceCentsForShipment(
  items: Array<{ shippingClass?: string | null; qty?: number | null }>
): number {
  // Charge once per order if any graded item is present.
  // If you ever want "per graded item", change this to count graded qty.
  const hasGraded = items.some(
    (it) => String(it.shippingClass || "").toLowerCase() === "graded"
  );
  return hasGraded ? 900 : 0;
}
