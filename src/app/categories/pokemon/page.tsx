// src/app/categories/pokemon/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Page() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/categories/pokemon/sets");
  }, [router]);

  return (
    <main style={{ padding: 24 }}>
      <p>Redirecting…</p>
      <p>
        If you aren’t redirected automatically,{" "}
        <a href="/categories/pokemon/sets">click here</a>.
      </p>
    </main>
  );
}
