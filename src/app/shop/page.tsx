import "server-only";

import Link from "next/link";
import type { Metadata } from "next";
import { site } from "@/config/site";
import { DEPARTMENTS } from "@/lib/shop/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Shop | ${site.name}`,
  description: "Shop Pokémon, Yu-Gi-Oh!, MTG, Sports, and accessories.",
  alternates: { canonical: `${site.url}/shop` },
};

export default function ShopIndexPage() {
  return (
    <main className="shopShell">
      <header className="shopHeader">
        <div className="eyebrow">Legendary Marketplace</div>
        <h1 className="shopTitle">Shop by department</h1>
        <p className="shopSubtitle">
          Curated inventory across Pokémon, Yu-Gi-Oh!, MTG, sports, and premium accessories.
        </p>
      </header>

      <section className="shopSection">
        <div className="tileGrid">
          {Object.values(DEPARTMENTS).map((d) => (
            <Link key={d.key} href={`/shop/${d.key}`} className="tile">
              <div className="tileTitle">{d.name}</div>
              <div className="tileDesc">{d.description}</div>
              <div className="tileCta">Browse →</div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
