// src/app/trade/page.tsx
import "server-only";

import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/config/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: `Trade Center — ${site.name}`,
  description: "Trade collectibles with other users by sharing an item link and connecting via trusted marketplaces.",
  keywords: ["trade", "collectibles", "Funko", "Pokemon", "Yu-Gi-Oh", "Magic", "swap"],
  robots: { index: true, follow: true },
};

export default function TradePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // This page is intentionally simple + safe (no private data required).
  // It provides a trading workflow through shareable links.
  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <h1 className="text-2xl font-bold text-white">Trade Center</h1>
        <p className="mt-2 text-sm text-white/70">
          Trading works best when both people are looking at the <strong>same item link</strong>. Share an item page
          from Legendary Collectibles, then finalize the trade on a platform you trust.
        </p>
      </div>

      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm text-white">
        <h2 className="text-lg font-semibold">How to trade (safe flow)</h2>
        <ol className="mt-2 list-decimal pl-5 text-sm text-white/80 space-y-2">
          <li>Open the item you want to trade and copy the page URL.</li>
          <li>Send that link to the other trader so you both reference the exact same item/variant.</li>
          <li>Finalize payment/shipping through a marketplace or escrow-style workflow when possible.</li>
          <li>Always compare photos, and don’t promise condition details you can’t verify.</li>
        </ol>

        <div className="mt-4 text-sm">
          <Link href="/categories/funko/items" className="text-sky-300 hover:underline">
            Browse Funko →
          </Link>
        </div>
      </div>
    </section>
  );
}
