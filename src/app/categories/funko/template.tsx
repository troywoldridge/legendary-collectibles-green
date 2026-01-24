// src/app/categories/funko/template.tsx
import "server-only";

import type React from "react";
import Link from "next/link";
import { FEATURES } from "@/config/flags";

export const runtime = "nodejs";

export default function FunkoGate({ children }: { children: React.ReactNode }) {
  if (FEATURES.funko) return children;

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <h1 className="text-2xl font-bold text-white">Funko (Coming Soon)</h1>
        <p className="mt-2 text-sm text-white/70">
          Funko pages are currently disabled while we finish setup.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link href="/categories" className="text-sky-300 hover:underline">
            ← Back to categories
          </Link>
          <Link href="/shop" className="text-sky-300 hover:underline">
            Shop →
          </Link>
        </div>
      </div>
    </section>
  );
}

