// src/app/categories/funko/items/[id]/prices/page.tsx
import "server-only";

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import MarketPrices from "@/components/MarketPrices";
import { site } from "@/config/site";
import { type DisplayCurrency } from "@/lib/pricing";

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

function readDisplay(sp: SearchParams): DisplayCurrency {
  const a = (Array.isArray(sp?.display) ? sp.display[0] : sp?.display) ?? "";
  const b = (Array.isArray(sp?.currency) ? sp.currency[0] : sp?.currency) ?? "";
  const v = (a || b).toUpperCase();
  return v === "USD" || v === "EUR" ? (v as DisplayCurrency) : "NATIVE";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const p = await params;
  const id = decodeURIComponent(String(p?.id ?? "")).trim();
  const canonical = absUrl(`/categories/funko/items/${encodeURIComponent(id)}/prices`);
  return {
    title: `Funko Prices — ${id} | ${site.name}`,
    description: "Funko Pop market prices, trends, and recent sales references.",
    keywords: ["Funko", "Funko Pop", "prices", "market value", "sales", "collection tracking"],
    alternates: { canonical },
    robots: { index: true, follow: true },
  };
}

export default async function FunkoPricesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const p = await params;
  const sp = await searchParams;
  const id = decodeURIComponent(String(p?.id ?? "")).trim();
  const display = readDisplay(sp);

  // Strip UI-only currency params if present in weird combos
  const hasUiCurrencyParams = sp?.display !== undefined || sp?.currency !== undefined;
  if (hasUiCurrencyParams) redirect(`/categories/funko/items/${encodeURIComponent(id)}/prices`);

  await auth(); // keeps parity with your auth patterns; page works without login too.

  return (
    <section className="space-y-6">
      <nav className="text-xs text-white/70">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/categories/funko/items" className="hover:underline">
            Funko
          </Link>
          <span className="text-white/40">/</span>
          <Link href={`/categories/funko/items/${encodeURIComponent(id)}`} className="hover:underline">
            Item
          </Link>
          <span className="text-white/40">/</span>
          <span className="text-white/90">Prices</span>
        </div>
      </nav>

      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <h1 className="text-2xl font-bold text-white">Market Prices</h1>
        <p className="mt-2 text-sm text-white/70">Market pricing and trends for this Funko item.</p>
      </div>

      <MarketPrices category="funko" cardId={id} display={display} />
    </section>
  );
}
