// src/lib/shop/client.ts
import "server-only";

import { headers } from "next/headers";
import { site } from "@/config/site";

export type ShopGame = "pokemon" | "yugioh" | "mtg" | "sports" | "funko" | "collectibles";
export type ShopFormat = "single" | "pack" | "box" | "bundle" | "lot" | "accessory";

export type ShopApiQuery = {
  game?: ShopGame;
  format?: ShopFormat;
  sealed?: boolean;
  graded?: boolean;
  q?: string;
  page?: number;
  limit?: number;
};

export type ShopProduct = {
  id: string;
  slug: string;
  title: string;
  priceCents: number;
  compareAtCents?: number | null;
  quantity: number;
  status: string;

  // Keep optional so older code doesn’t break
  image?: string | null;

  // Some implementations return arrays — support both
  images?: Array<string | { url: string; alt?: string | null }> | null;
};

export type ShopProductsResponse = {
  ok: true;
  page: number;
  limit: number;
  total: number;
  items: ShopProduct[];
} | {
  ok: false;
  error: string;
  message?: string;
};

export function toQueryString(q: Record<string, unknown>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

export function formatCurrency(cents: number): string {
  const n = Number(cents || 0) / 100;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

/**
 * Next/headers typing can vary by Next version.
 * This helper safely supports both synchronous and Promise-returning headers().
 */
async function safeHeaders(): Promise<any | null> {
  try {
    const h: any = (headers as any)();
    if (h && typeof h.then === "function") return await h;
    return h ?? null;
  } catch {
    return null;
  }
}

function absoluteBaseFromRequest(h: any | null): string {
  const configured = String(site?.url ?? "").trim();
  if (configured) return configured.replace(/\/+$/, "");

  const proto =
    (h?.get?.("x-forwarded-proto") ||
      h?.get?.("X-Forwarded-Proto") ||
      "https").toString();

  const host =
    (h?.get?.("x-forwarded-host") ||
      h?.get?.("X-Forwarded-Host") ||
      h?.get?.("host") ||
      h?.get?.("Host") ||
      "").toString();

  if (!host) return "https://legendary-collectibles.com";
  return `${proto}://${host}`;
}

function apiUrl(pathAndQuery: string, base: string): string {
  const baseClean = base.replace(/\/+$/, "");
  const pathClean = pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`;
  return `${baseClean}${pathClean}`;
}

export async function fetchShopProducts(query: ShopApiQuery): Promise<ShopProductsResponse> {
  const page = Math.max(1, Number(query.page ?? 1));
  const limit = Math.min(60, Math.max(1, Number(query.limit ?? 24)));

  const qs = toQueryString({
    ...(query.game ? { game: query.game } : {}),
    ...(query.format ? { format: query.format } : {}),
    ...(typeof query.sealed === "boolean" ? { sealed: query.sealed ? "1" : "0" } : {}),
    ...(typeof query.graded === "boolean" ? { graded: query.graded ? "1" : "0" } : {}),
    ...(query.q ? { q: query.q } : {}),
    page,
    limit,
  });

  const h = await safeHeaders();
  const base = absoluteBaseFromRequest(h);

  const url = apiUrl(`/api/shop/products${qs}`, base);

  const res = await fetch(url, {
    method: "GET",
    // IMPORTANT: avoid caching old empty results
    cache: "no-store",
    headers: {
      // Hint proxies/caches not to reuse
      "accept": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: `http_${res.status}`, message: text || res.statusText };
  }

  const data = (await res.json().catch(() => null)) as any;
  if (!data || data.ok === false) {
    return { ok: false, error: data?.error || "bad_response", message: data?.message };
  }

  // Normalize output shape gently
  const items: ShopProduct[] = Array.isArray(data.items)
    ? data.items.map((x: any) => ({
        id: String(x.id),
        slug: String(x.slug),
        title: String(x.title),
        priceCents: Number(x.priceCents ?? x.price_cents ?? 0),
        compareAtCents: x.compareAtCents ?? x.compare_at_cents ?? null,
        quantity: Number(x.quantity ?? 0),
        status: String(x.status ?? "draft"),
        image: (x.image ?? x.image_url ?? null) as any,
        images: (x.images ?? null) as any,
      }))
    : [];

  return {
    ok: true,
    page: Number(data.page ?? page),
    limit: Number(data.limit ?? limit),
    total: Number(data.total ?? items.length),
    items,
  };
}
