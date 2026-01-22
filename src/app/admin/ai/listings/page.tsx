import "server-only";
import type { Metadata } from "next";
import ListingsClient from "./ListingsClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin • AI Listings • Legendary Collectibles",
  description: "Generate and apply collector-safe listing copy using strict JSON output.",
};

export default function Page() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold">Admin • AI Listings</h1>
      <p className="opacity-80 mt-2">
        Browse products, load images for the selected product, generate strict JSON, and apply copy back to the product.
      </p>
      <div className="mt-8">
        <ListingsClient />
      </div>
    </div>
  );
}
