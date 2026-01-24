// src/app/categories/funko/items/page.tsx
import "server-only";

import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import Image from "next/image";


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
  const name = String(r.name ?? r.id).trim();
  const num = r.number ? ` #${String(r.number).trim()}` : "";
  const line = r.line ? ` (${String(r.line).trim()})` : "";
  return `${name}${num}${line}`;
}

function bestImage(r: Row) {
  return r.image_large || r.image_small || null;
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
          <Link href="/" className="hover:underline">
            Home
          </Link>
          <span className="text-white/40">/</span>
          <Link href="/categories" className="hover:underline">
            Categories
          </Link>
          <span className="text-white/40">/</span>

          {/* If /categories/funko is still a hard 404, point this at the working index */}
          <Link href="/categories/funko/items" className="hover:underline">
            Funko
          </Link>

          <span className="text-white/40">/</span>
          <span className="text-white/90">Items</span>
        </div>
      </nav>

      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <h1 className="text-2xl font-bold text-white">Funko Items</h1>
        <p className="mt-2 text-sm text-white/70">
          Browse Funko Pop catalog items. Click an item to view details, variants, and market data.
        </p>
      </div>

      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        {rows.length ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
            {rows.map((r) => {
              const href = `/categories/funko/items/${encodeURIComponent(r.id)}`;
              const title = titleOf(r);
              const img = bestImage(r);

              return (
                <Link
                  key={r.id}
                  href={href}
                  className="group rounded-2xl border border-white/15 bg-black/20 p-3 hover:border-white/30 transition"
                >
                  <div className="relative aspect-3/4 w-full overflow-hidden rounded-xl bg-black/30">
                    {img ? (
                      // Using <img> is fine for external URLs; Image component would need remotePatterns config
                      <Image
                          src={img}
                          alt={title}
                          fill
                          className="object-contain transition-transform group-hover:scale-[1.03]"
                          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 20vw, 16vw"
                          priority={false}
                        />

                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-white/50">
                        No image
                      </div>
                    )}
                  </div>

                  <div className="mt-3 space-y-1">
                    <div className="text-sm font-semibold text-white line-clamp-2">{title}</div>

                    {r.franchise ? (
                      <div className="text-xs text-white/60 line-clamp-1">{r.franchise}</div>
                    ) : null}

                    {r.series ? (
                      <div className="text-xs text-white/40 line-clamp-1">{r.series}</div>
                    ) : null}
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-white/70">
            No Funko items yet. Insert your first row into <code>public.funko_items</code>.
          </div>
        )}
      </div>
    </section>
  );
}
