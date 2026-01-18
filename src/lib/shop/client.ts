// src/lib/shop/client.ts
import { headers } from "next/headers";
import { site } from "@/config/site";

export type ShopApiQuery = {
  game?: "pokemon" | "yugioh" | "mtg" | "sports";
  format?: "single" | "pack" | "box" | "bundle" | "lot" | "accessory";
  sealed?: boolean;
  graded?: boolean;
};

export type ShopProduct = {
  id: string;
  title: string;
  slug: string;
  subtitle?: string | null;
  game: "pokemon" | "yugioh" | "mtg" | "sports";
  format: "single" | "pack" | "box" | "bundle" | "lot" | "accessory";
  sealed?: boolean | null;
  isGraded?: boolean | null;
  grader?: string | null;
  gradeX10?: number | null;
  condition?: string | null;
  priceCents: number;
  compareAtCents?: number | null;
  inventoryType?: string | null;
  quantity?: number | null;
  image?: { url: string; alt: string | null } | null;
};

export type ShopProductsResponse = {
  items: ShopProduct[];
  total: number;
  page: number;
  limit: number;
};

const PASS_THROUGH_KEYS = [
  "q",
  "sort",
  "page",
  "limit",
  "priceMin",
  "priceMax",
  "grader",
  "gradeMin",
  "condition",
  "tag",
];

export function formatCurrency(cents: number): string {
  const n = Number(cents ?? 0) / 100;
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export async function resolveShopBaseUrl() {
  const envUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.SITE_URL ??
    process.env.VERCEL_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    site.url;

  if (envUrl) {
    const withProtocol = envUrl.startsWith("http") ? envUrl : `https://${envUrl}`;
    return withProtocol.replace(/\/$/, "");
  }

  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") || hdrs.get("host");
  const proto = hdrs.get("x-forwarded-proto") || "https";
  return host ? `${proto}://${host}` : "http://127.0.0.1:3001";
}

export function buildShopQuery(
  api: ShopApiQuery,
  searchParams: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const qs = new URLSearchParams();

  if (api.game) qs.set("game", api.game);
  if (api.format) qs.set("format", api.format);
  if (typeof api.sealed === "boolean") qs.set("sealed", api.sealed ? "true" : "false");
  if (typeof api.graded === "boolean") qs.set("graded", api.graded ? "true" : "false");

  for (const key of PASS_THROUGH_KEYS) {
    const v = searchParams[key];
    if (typeof v === "string" && v.trim()) qs.set(key, v.trim());
  }

  return qs;
}

export async function fetchShopProducts(
  api: ShopApiQuery,
  searchParams: Record<string, string | string[] | undefined>,
): Promise<ShopProductsResponse & { _error?: string }> {
  const qs = buildShopQuery(api, searchParams);
  const base = await resolveShopBaseUrl();
  const url = `${base}/api/shop/products?${qs.toString()}`;

  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { items: [], total: 0, page: 1, limit: 24, _error: text.slice(0, 250) };
  }

  return res.json();
}
