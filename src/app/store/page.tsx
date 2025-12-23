// src/app/store/page.tsx
import Link from "next/link";
import Image from "next/image";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

type Listing = {
  id: string;
  title: string;
  price_cents: number;
  currency: string;
  primary_image_url: string | null;
  game: string;
  condition: string | null;
  quantity: number;
};

function money(cents: number, currency: string) {
  const cur = (currency || "USD").toUpperCase();
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: cur,
  }).format((cents ?? 0) / 100);
}

export default async function StorePage() {
  const res = await db.execute<Listing>(sql`
    SELECT
      id,
      title,
      price_cents,
      currency,
      primary_image_url,
      game,
      condition,
      quantity
    FROM public.store_listings
    WHERE status = 'active'
      AND quantity > 0
    ORDER BY featured DESC, updated_at DESC
    LIMIT 48
  `);

  const listings = res.rows ?? [];

  return (
    <div className="text-white">
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Shop</h1>
          <div className="mt-1 text-sm text-white/70">
            Singles, slabs, and sealed — live inventory.
          </div>
        </div>

        <div className="flex gap-2">
          <Link
            href="/store/pokemon"
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
          >
            Pokémon
          </Link>
          <Link
            href="/store/yugioh"
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
          >
            Yu-Gi-Oh!
          </Link>
          <Link
            href="/store/mtg"
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
          >
            MTG
          </Link>
        </div>
      </div>

      {listings.length === 0 ? (
        <div className="rounded-xl border border-white/15 bg-white/5 p-6 text-white/80">
          No active listings yet.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {listings.map((l) => (
            <Link
              key={l.id}
              href={`/store/listing/${l.id}`}
              className="group overflow-hidden rounded-xl border border-white/12 bg-white/5 transition hover:bg-white/8"
            >
              <div className="relative aspect-[4/5] w-full overflow-hidden bg-black/20">
                {l.primary_image_url ? (
                  <Image
                    src={l.primary_image_url}
                    alt={l.title}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 20vw"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-white/60">
                    No image
                  </div>
                )}
              </div>

              <div className="p-3">
                <div className="line-clamp-2 text-sm font-semibold">{l.title}</div>

                <div className="mt-2 flex items-center justify-between">
                  <div className="text-base font-bold">
                    {money(l.price_cents, l.currency)}
                  </div>
                  <div className="text-xs text-white/60">
                    {String(l.game).toUpperCase()}
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between text-xs text-white/60">
                  <span>{l.condition ?? "—"}</span>
                  <span>Qty {l.quantity}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
