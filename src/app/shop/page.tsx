// src/app/shop/page.tsx
import "server-only";

import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Tile = {
  title: string;
  subtitle: string;
  href: string;
};

const TILES: Tile[] = [
  {
    title: "Pokémon",
    subtitle: "Singles, sealed, and more.",
    href: "/shop/pokemon/all",
  },
  {
    title: "Yu-Gi-Oh!",
    subtitle: "Singles, sealed, and more.",
    href: "/shop/yugioh/all",
  },
  {
    title: "Magic: The Gathering",
    subtitle: "Singles, sealed, and more.",
    href: "/shop/mtg/all",
  },
  {
    title: "Funko",
    subtitle: "Funko items for sale.",
    href: "/shop/funko/all",
  },
  {
    title: "Figures & Collectibles",
    subtitle: "Everything NOT Pokémon, Yu-Gi-Oh!, MTG, or Funko.",
    href: "/shop/collectibles/all",
  },
];

export default async function ShopHomePage() {
  noStore();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <div className="rounded-2xl border border-white/15 bg-white/5 p-6 backdrop-blur-sm">
        <div className="text-xs uppercase tracking-wide text-white/60">Shop</div>
        <h1 className="mt-2 text-3xl font-semibold text-white">Shop Departments</h1>
        <p className="mt-2 text-sm text-white/70">
          Pick a department to browse what’s currently for sale.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TILES.map((t) => (
            <Link
              key={t.title}
              href={t.href}
              className="group rounded-2xl border border-white/15 bg-white/5 p-5 transition hover:border-white/25 hover:bg-white/8"
            >
              <div className="text-lg font-semibold text-white">{t.title}</div>
              <div className="mt-1 text-sm text-white/70">{t.subtitle}</div>

              <div className="mt-4 text-xs text-white/60 group-hover:text-white/80">
                Browse →
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-8 rounded-xl border border-white/12 bg-black/20 p-4 text-xs text-white/60">
          <div className="font-medium text-white/80">Note</div>
          <p className="mt-1">
            Your <span className="text-white/80">collection/catalog</span> pages live under{" "}
            <span className="text-white/80">/categories/*</span>. The{" "}
            <span className="text-white/80">shop</span> lives under{" "}
            <span className="text-white/80">/shop/*</span>.
          </p>
        </div>
      </div>
    </main>
  );
}
