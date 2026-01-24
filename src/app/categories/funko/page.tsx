// src/app/categories/funko/page.tsx
import "server-only";

import Link from "next/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function FunkoCategoryPage() {
  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <h1 className="text-2xl font-bold text-white">Funko</h1>
        <p className="mt-2 text-sm text-white/70">
          Browse Funko catalog items and add them to your personal collection.
        </p>

        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link href="/categories/funko/items" className="text-sky-300 hover:underline">
            Browse items →
          </Link>
          <Link href="/collection/add?game=funko" className="text-sky-300 hover:underline" prefetch={false}>
            Add to my collection →
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <div className="text-sm font-semibold text-white">Quick links</div>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-white/80">
          <li>
            <Link href="/categories/funko/items" className="text-sky-300 hover:underline">
              Funko Items
            </Link>
          </li>
        </ul>
      </div>
    </section>
  );
}
