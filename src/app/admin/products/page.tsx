import "server-only";
import type { Metadata } from "next";
import ProductsClient from "./ProductsClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin • Products • Legendary Collectibles",
  description: "Search and manage products. Quick links into AI listings generation.",
};

export default function Page() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Admin • Products</h1>
          <p className="opacity-80 mt-2">
            Search products, view counts, and jump into AI Listings to generate/apply copy.
          </p>
        </div>
        <a
          href="/admin/products/new"
          className="rounded-md border border-white/10 px-3 py-2 hover:bg-white/5"
        >
          + New Product
        </a>
      </div>

      <div className="mt-8">
        <ProductsClient />
      </div>
    </div>
  );
}
