// src/app/admin/products/new/page.tsx
import "server-only";
import type { Metadata } from "next";
import NewProductClient from "./NewProductClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin • New Product • Legendary Collectibles",
  description: "Create a product and optionally jump straight into AI Listings generation.",
};

export default function Page() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold">Admin • New Product</h1>
      <p className="opacity-80 mt-2">
        Create a product record, then optionally jump into AI Listings to generate/apply copy.
      </p>

      <div className="mt-8">
        <NewProductClient />
      </div>
    </div>
  );
}
