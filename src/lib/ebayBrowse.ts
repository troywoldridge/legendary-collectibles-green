// src/lib/ebayBrowse.ts
import "server-only";
import { getEbayAppToken } from "./ebayAuth";

export type EbayFoundItem = {
  title: string | null;
  price: { value: string | null; currency: string | null } | null;
  url: string | null;
};

export async function ebaySearchBestPrice(q: string): Promise<EbayFoundItem | null> {
  const token = await getEbayAppToken();
  const url = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "10");

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": process.env.EBAY_MARKETPLACE?.trim() || "EBAY_US",
    },
    cache: "no-store",
  });

  const data: any = await res.json();
  if (!res.ok) {
    // Don’t throw—just return null for graceful fallback
    console.error("[eBay browse] HTTP", res.status, data);
    return null;
  }

  const items: any[] = Array.isArray(data?.itemSummaries) ? data.itemSummaries : [];
  if (!items.length) return null;

  // Pick the lowest priced item that actually has a price
  let best: any = null;
  for (const it of items) {
    const p = it?.price;
    if (!p?.value) continue;
    if (!best) best = it;
    else if (Number(p.value) < Number(best.price?.value ?? Number.POSITIVE_INFINITY)) best = it;
  }
  if (!best) return null;

  return {
    title: best.title ?? null,
    price: { value: best.price?.value ?? null, currency: best.price?.currency ?? null },
    url: best.itemWebUrl ?? null,
  };
}
