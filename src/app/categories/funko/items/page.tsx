// src/app/categories/funko/items/page.tsx
import "server-only";

import type { Metadata } from "next";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";

import FunkoItemsClient from "./FunkoItemsClient";
import { queryFunkoItems } from "@/lib/funko/query";
import { site } from "@/config/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Record<string, string | string[] | undefined>;

function absBase() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
    process.env.SITE_URL?.replace(/\/+$/, "") ||
    site?.url?.replace(/\/+$/, "") ||
    "https://legendary-collectibles.com"
  );
}

function absUrl(path: string) {
  const base = absBase().replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function getOne(sp: SearchParams, key: string) {
  const v = sp?.[key];
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

function toBool(v: string): boolean | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return null;
  if (["1", "true", "yes", "y"].includes(s)) return true;
  if (["0", "false", "no", "n"].includes(s)) return false;
  return null;
}

/**
 * IMPORTANT: empty string must return null (NOT 0)
 * because Number("") === 0 in JS.
 */
function toInt(v: string): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function clampPageSize(n: number) {
  const allowed = new Set([24, 48, 72, 96]);
  return allowed.has(n) ? n : 48;
}

type SortKey = "relevance" | "release_year" | "name" | "price" | "franchise" | "series";
type SortOrder = "asc" | "desc";

function normalizeSort(v: string): SortKey {
  const s = String(v ?? "").trim();
  const allowed: SortKey[] = ["relevance", "release_year", "name", "price", "franchise", "series"];
  return (allowed.includes(s as SortKey) ? (s as SortKey) : "relevance");
}

function normalizeOrder(v: string): SortOrder {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "asc" ? "asc" : "desc";
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const q = String(getOne(sp, "q") ?? "").trim();

  const title = q
    ? `Search Funko: ${q} | ${site.name}`
    : `Funko Pops — Browse, Search & Track Prices | ${site.name}`;

  const description =
    "Browse Funko Pop details with fast search, filters, sorting, images, variants, and market pricing. Track your collection and set alerts.";

  const canonical = absUrl("/categories/funko/items");

  return {
    title,
    description,
    keywords: [
      "Funko",
      "Funko Pop",
      "collectibles",
      "vinyl figure",
      "chase",
      "exclusive",
      "price tracking",
      "collection tracker",
      "market prices",
      "Legendary Collectibles",
    ],
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      url: canonical,
      title,
      description,
      siteName: site.name,
      images: [{ url: absUrl("/og-image.png") }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [absUrl("/og-image.png")],
    },
  };
}

export default async function FunkoBrowsePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  noStore();
  const sp = await searchParams;

  const q = String(getOne(sp, "q") ?? "").trim();
  const franchise = String(getOne(sp, "franchise") ?? "").trim();
  const series = String(getOne(sp, "series") ?? "").trim();
  const rarity = String(getOne(sp, "rarity") ?? "").trim();

  const chase = toBool(String(getOne(sp, "chase") ?? ""));
  const exclusive = toBool(String(getOne(sp, "exclusive") ?? ""));

  // ✅ these are now null when empty
  const yearMin = toInt(String(getOne(sp, "yearMin") ?? ""));
  const yearMax = toInt(String(getOne(sp, "yearMax") ?? ""));
  const priceMin = toInt(String(getOne(sp, "priceMin") ?? ""));
  const priceMax = toInt(String(getOne(sp, "priceMax") ?? ""));

  // ✅ normalized and never undefined
  const sort: SortKey = normalizeSort(String(getOne(sp, "sort") ?? "relevance"));
  const order: SortOrder = normalizeOrder(String(getOne(sp, "order") ?? "desc"));

  const page = Math.max(1, toInt(String(getOne(sp, "page") ?? "")) ?? 1);
  const pageSize = clampPageSize(toInt(String(getOne(sp, "pageSize") ?? "")) ?? 48);

  const res = await queryFunkoItems({
    q,
    franchise: franchise || undefined,
    series: series || undefined,
    rarity: rarity || undefined,
    chase,
    exclusive,
    yearMin: yearMin ?? undefined,
    yearMax: yearMax ?? undefined,
    priceMin: priceMin ?? undefined,
    priceMax: priceMax ?? undefined,
    sort,
    order,
    page,
    pageSize,
  });

  // Force the exact shape the client expects (strings never undefined)
  const data = {
    items: res.items,
    page: res.page,
    pageSize: res.pageSize,
    total: res.total,
    totalPages: res.totalPages,
    sort: String(res.sort ?? sort),
    order: String(res.order ?? order),
    applied: res.applied,
  };

  return (
    <section className="space-y-6">
      <nav className="text-xs text-white/70">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/" className="hover:underline">
            Home
          </Link>
          <span className="text-white/40">/</span>
          <Link href="/categories" className="hover:underline">
            Categories
          </Link>
          <span className="text-white/40">/</span>
          <span className="text-white/90">Funko</span>
        </div>
      </nav>

      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <h1 className="text-2xl font-bold text-white">Funko Pops</h1>
        <p className="mt-2 text-sm text-white/70">
          Search by <strong>name</strong>, <strong>franchise</strong>, or <strong>series</strong>, then filter and sort
          results. Click any item to view images, variants, and market pricing.
        </p>
      </div>

      <FunkoItemsClient initial={data as any} />
    </section>
  );
}
