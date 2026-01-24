// src/app/categories/funko/items/page.tsx
import "server-only";

import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = {
  id: string;
  name: string | null;
  franchise: string | null;
  series: string | null;
  line: string | null;
  number: string | null;
  upc: string | null;
  image_small: string | null;
  image_large: string | null;
  updated_at: string | null;
};

function titleOf(r: Row) {
  const name = (r.name ?? r.id).trim();
  const num = r.number ? ` #${String(r.number).trim()}` : "";
  const line = r.line ? ` (${r.line.trim()})` : "";
  return `${name}${num}${line}`;
}

export default async function FunkoItemsPage() {
  noStore();

  const rows =
    (
      await db.execute<Row>(sql`
        SELECT
          id,
          name,
          franchise,
          series,
          line,
          number,
          upc,
          image_small,
          image_large,
          updated_at::text
        FROM public.funko_items
        ORDER BY updated_at DESC NULLS LAST, id ASC
        LIMIT 50
      `)
    ).rows ?? [];

  return (
    <section className="space-y-6">
      <nav className="text-xs text-white/70">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/" className="hover:underline">Home</Link>
          <span className="text-white/40">/</span>
          <Link href="/categories" className="hover:underline">Categories</Link>
          <span className="text-white/40">/</span>
          <Link href="/categories/funko" className="hover:underline">Funko</Link>
          <span className="text-white/40">/</span>
          <span className="text-white/90">Items</span>
        </div>
      </nav>

      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <h1 className="text-2xl font-bold text-white">Funko Items</h1>
        <p className="mt-2 text-sm text-white/70">Browse Funko catalog items. Click any item to view details.</p>
      </div>

      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        {rows.length ? (
          <ul className="divide-y divide-white/10">
            {rows.map((r) => (
              <li key={r.id} className="py-3">
                <Link
                  href={`/categories/funko/items/${encodeURIComponent(r.id)}`}
                  className="text-sky-300 hover:underline"
                >
                  {titleOf(r)}
                </Link>

                <div className="mt-1 text-xs text-white/60">
                  {r.franchise ? <span className="mr-3">Franchise: {r.franchise}</span> : null}
                  {r.series ? <span className="mr-3">Series: {r.series}</span> : null}
                  {r.upc ? <span className="mr-3">UPC: {r.upc}</span> : null}
                  {r.updated_at ? <span className="mr-3">Updated: {r.updated_at}</span> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm text-white/70">
            No Funko items yet. Insert your first row into <code>public.funko_items</code>.
          </div>
        )}
      </div>
    </section>
  );
}
