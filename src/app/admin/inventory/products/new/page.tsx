import "server-only";
import type { Metadata } from "next";
import NewProductClient from "./NewProductClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin • New Product • Legendary Collectibles",
  description: "Create a product and optional images in the database.",
};

export default function Page() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold">Admin • New Product</h1>
      <p className="opacity-80 mt-2">
        Creates a <code>products</code> row (and optional <code>product_images</code> rows).
      </p>

      <div className="mt-8">
        <NewProductClient />
      </div>
    </div>
  );
}
