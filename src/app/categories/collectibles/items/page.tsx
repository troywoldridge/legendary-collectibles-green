// src/app/categories/collectibles/items/page.tsx
import "server-only";

import type { Metadata } from "next";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";

import FunkoItemsClient from "@/app/categories/funko/items/FunkoItemsClient";
import { queryCollectiblesItems } from "@/lib/collectibles/query";
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

type SortKey = "relevance" | "release_year" | "name" | "franchise" | "series";
type SortOrder = "asc" | "desc";

function normalizeSort(v: string): SortKey {
  const s = String(v ?? "").trim();
  const allowed: SortKey[] = ["relevance", "release_year", "name", "franchise", "series"];
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
    ? `Search Figures & Collectibles: ${q} | ${site.name}`
    : `Figures & Collectibles — Browse & Search | ${site.name}`;

  const description =
    "Browse figures and collectibles including anime, manga, and pop culture brands. Search by name, franchise, or series and view item details.";

  const canonical = absUrl("/categories/collectibles/items");

  return {
    title,
    description,
    keywords: [
      "figures",
      "collectibles",
      "anime figures",
      "manga",
      "Banpresto",
      "Q Posket",
      "Hasbro",
      "Handmade By Robots",
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

export default async function CollectiblesBrowsePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  noStore();
  const sp = await searchParams;

  const q = String(getOne(sp, "q") ?? "").trim();
  const franchise = String(getOne(sp, "franchise") ?? "").trim();
  const series = String(getOne(sp, "series") ?? "").trim();

  const yearMin = toInt(String(getOne(sp, "yearMin") ?? ""));
  const yearMax = toInt(String(getOne(sp, "yearMax") ?? ""));

  const sort: SortKey = normalizeSort(String(getOne(sp, "sort") ?? "relevance"));
  const order: SortOrder = normalizeOrder(String(getOne(sp, "order") ?? "desc"));

  const page = Math.max(1, toInt(String(getOne(sp, "page") ?? "")) ?? 1);
  const pageSize = clampPageSize(toInt(String(getOne(sp, "pageSize") ?? "")) ?? 48);

  const res = await queryCollectiblesItems({
    q,
    franchise: franchise || undefined,
    series: series || undefined,
    yearMin: yearMin ?? undefined,
    yearMax: yearMax ?? undefined,
    sort,
    order,
    page,
    pageSize,
  });

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
          <span className="text-white/90">Figures &amp; Collectibles</span>
        </div>
      </nav>

      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <h1 className="text-2xl font-bold text-white">Figures &amp; Collectibles</h1>
        <p className="mt-2 text-sm text-white/70">
          Browse brands beyond Funko — including anime and pop culture collectibles. Search by{" "}
          <strong>name</strong>, <strong>franchise</strong>, or <strong>series</strong>, then sort results.
        </p>
      </div>

      {/* Reuse existing list UI renderer for now */}
      <FunkoItemsClient initial={data as any} />
    </section>
  );
}
