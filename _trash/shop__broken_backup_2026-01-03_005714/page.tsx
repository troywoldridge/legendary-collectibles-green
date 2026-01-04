// src/app/shop/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/config/site";

export const metadata: Metadata = {
  title: `Shop Collectibles | ${site.name}`,
  description:
    "Shop Pokémon, Yu-Gi-Oh!, and MTG. Singles, graded cards, sealed product, and accessories.",
  alternates: { canonical: `${site.url}/shop` },
  openGraph: {
    title: `Shop Collectibles | ${site.name}`,
    description:
      "Shop Pokémon, Yu-Gi-Oh!, and MTG. Singles, graded cards, sealed product, and accessories.",
    url: `${site.url}/shop`,
  },
};

const GAMES = [
  { key: "pokemon", name: "Pokémon", desc: "Singles, graded, sealed, deals" },
  { key: "yugioh", name: "Yu-Gi-Oh!", desc: "Singles, staples, sealed" },
  { key: "mtg", name: "Magic: The Gathering", desc: "Singles, commander, sealed" },
];

const FORMAT_TILES = [
  { key: "single", title: "Singles", desc: "Raw & graded cards" },
  { key: "pack", title: "Packs", desc: "Sealed booster packs" },
  { key: "box", title: "Boxes", desc: "Booster & display boxes" },
  { key: "bundle", title: "Bundles", desc: "ETBs & premium boxes" },
  { key: "lot", title: "Lots", desc: "Bulk, bundles, mystery" },
  { key: "accessory", title: "Accessories", desc: "Sleeves, binders, storage" },
];

const QUICK_PICKS = [
  { label: "🔥 Hot Deals", href: "/shop/pokemon/single?tag=hot-deals" },
  { label: "🆕 New Arrivals", href: "/shop/pokemon/single?sort=new" },
  { label: "🏆 Graded Gems", href: "/shop/pokemon/single?graded=true&grader=psa&gradeMin=90" },
  { label: "📦 Sealed Packs", href: "/shop/pokemon/pack?sealed=true&sort=price_asc" },
];

export default function ShopPage() {
  return (
    <main className="shopShell">
      {/* HERO */}
      <header className="shopHeader">
        <h1 className="shopTitle">Shop</h1>
        <p className="shopSubtitle">
          Singles, slabs, sealed product, and essentials — curated for collectors.
        </p>

        <div className="shopHeroCtas">
          <Link href="/shop/pokemon/single" className="btnPrimary">
            Browse Pokémon Singles →
          </Link>
          <Link href="/shop/pokemon/pack?sealed=true" className="btnSecondary">
            Shop Sealed →
          </Link>
        </div>

        <div className="shopTrustRow">
          <span className="trustPill">Fast shipping</span>
          <span className="trustPill">Careful packaging</span>
          <span className="trustPill">Collector-focused</span>
        </div>
      </header>

      {/* BY GAME */}
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

      {/* BY FORMAT (retail-y) */}
      <section className="shopSection">
        <h2 className="shopH2">Shop by Format</h2>
        <div className="tileGrid">
          {FORMAT_TILES.map((f) => (
            <Link
              key={f.key}
              href={`/shop/pokemon/${f.key}`}
              className="tile tileSmall"
              title={`Shop ${f.title}`}
            >
              <div className="tileTitle">{f.title}</div>
              <div className="tileDesc">{f.desc}</div>
              <div className="tileCta">Browse →</div>
            </Link>
          ))}
        </div>
        <p className="shopHint">
          Start with Pokémon by default, then switch games from the top tiles.
        </p>
      </section>

      {/* QUICK PICKS */}
      <section className="shopSection">
        <h2 className="shopH2">Quick Picks</h2>
        <div className="tileGrid">
          {QUICK_PICKS.map((t) => (
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
