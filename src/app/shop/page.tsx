// src/app/shop/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/config/site";

export const metadata: Metadata = {
  title: `Shop Collectibles | ${site.name}`,
  description:
    "Shop Pokémon, Yu-Gi-Oh!, MTG and more. Browse singles, slabs, sealed product, and deals.",
  alternates: {
    canonical: `${site.url}/shop`,
  },
  openGraph: {
    title: `Shop Collectibles | ${site.name}`,
    description:
      "Shop Pokémon, Yu-Gi-Oh!, MTG and more. Browse singles, slabs, sealed product, and deals.",
    url: `${site.url}/shop`,
  },
};

const GAMES = [
  { key: "pokemon", name: "Pokémon", desc: "Singles, slabs, sealed, deals" },
  { key: "yugioh", name: "Yu-Gi-Oh!", desc: "Cards, graded, sealed" },
  { key: "mtg", name: "Magic", desc: "Singles + sealed" },
];

const INTENT_TILES = [
  { label: "Hot Deals", href: "/shop/pokemon/single?tag=hot-deals" },
  { label: "New Arrivals", href: "/shop/pokemon/single?sort=new" },
  { label: "Graded Gems", href: "/shop/pokemon/single?graded=true&grader=psa&gradeMin=90" },
  { label: "Sealed Packs", href: "/shop/pokemon/pack?sealed=true" },
];

export default function ShopPage() {
  return (
    <main className="shopShell">
      <header className="shopHeader">
        <h1 className="shopTitle">Shop</h1>
        <p className="shopSubtitle">
          Browse by game, format, or jump straight into the good stuff.
        </p>
      </header>

      <section className="shopSection">
        <h2 className="shopH2">Browse by Game</h2>
        <div className="tileGrid">
          {GAMES.map((g) => (
            <Link key={g.key} href={`/shop/${g.key}`} className="tile">
              <div className="tileTitle">{g.name}</div>
              <div className="tileDesc">{g.desc}</div>
              <div className="tileCta">Shop {g.name} →</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="shopSection">
        <h2 className="shopH2">Quick Picks</h2>
        <div className="tileGrid">
          {INTENT_TILES.map((t) => (
            <Link key={t.href} href={t.href} className="tile tileSmall">
              <div className="tileTitle">{t.label}</div>
              <div className="tileCta">Browse →</div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
