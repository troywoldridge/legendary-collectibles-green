import "server-only";
import Link from "next/link";
import type { Metadata } from "next";
import { site } from "@/config/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Shop | ${site.name}`,
  description: "Shop Pokémon, Yu-Gi-Oh!, MTG and accessories.",
  alternates: { canonical: `${site.url}/shop` },
};

const DEPARTMENTS = [
  { key: "pokemon", name: "Pokémon", desc: "Singles, sealed, graded, and more" },
  { key: "yugioh", name: "Yu-Gi-Oh!", desc: "Singles, sealed, graded, and more" },
  { key: "mtg", name: "Magic: The Gathering", desc: "Singles + sealed + commander staples" },
  { key: "accessories", name: "Accessories", desc: "Sleeves, top loaders, binders, deck boxes" },
] as const;

export default function ShopIndexPage() {
  return (
    <main className="shopShell">
      <header className="shopHeader">
        <h1 className="shopTitle">Shop</h1>
        <p className="shopSubtitle">Pick a department to start browsing.</p>
      </header>

      <section className="shopSection">
        <div className="tileGrid">
          {DEPARTMENTS.map((d) => (
            <Link key={d.key} href={`/shop/${d.key}`} className="tile">
              <div className="tileTitle">{d.name}</div>
              <div className="tileDesc">{d.desc}</div>
              <div className="tileCta">Browse →</div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
