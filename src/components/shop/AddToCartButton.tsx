"use client";

import { useState } from "react";

export default function AddToCartButton({
  product,
}: {
  product: { id: string; slug: string; title: string; priceCents: number; imageUrl: string | null };
}) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function add() {
    setLoading(true);
    setDone(false);
    try {
      const res = await fetch("/api/cart/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          quantity: 1,
          // snapshot fields (high value for analytics + stability)
          title: product.title,
          priceCents: product.priceCents,
          imageUrl: product.imageUrl,
          slug: product.slug,
        }),
      });

      if (!res.ok) throw new Error("add-to-cart failed");
      setDone(true);
      setTimeout(() => setDone(false), 1200);
    } catch (e) {
      console.error(e);
      alert("Could not add to cart. (We’ll fix the cart endpoint next.)");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button className="btn btnFull" onClick={add} disabled={loading}>
      {loading ? "Adding…" : done ? "Added ✓" : "Add to cart"}
    </button>
  );
}
