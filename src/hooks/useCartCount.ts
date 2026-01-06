// src/hooks/useCartCount.ts
"use client";

import { useEffect, useState } from "react";

export function useCartCount() {
  const [count, setCount] = useState(0);

  async function refresh() {
    try {
      const res = await fetch("/api/cart/count", { cache: "no-store" });
      const j = await res.json();
      setCount(Number(j?.count ?? 0));
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15000); // 15s
    return () => clearInterval(id);
  }, []);

  return count;
}
