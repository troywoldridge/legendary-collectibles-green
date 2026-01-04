// src/app/shop/[game]/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { site } from "@/config/site";

function normParam(s: string) {
  try {
    return decodeURIComponent(s).trim().toLowerCase();
  } catch {
    return String(s).trim().toLowerCase();
  }
}

const GAMES: Record<string, { name: string; desc: string }> = {
  pokemon: { name: "Pokémon", desc: "Singles, graded cards, sealed product, and deals." },
  yugioh: { name: "Yu-Gi-Oh!", desc: "Singles, graded cards, sealed product, and deals." },
  mtg: { name: "Magic: The Gathering", desc: "Singles, graded cards, sealed product, and deals." },
};

const FORMAT_TILES = [
  { key: "single", title: "Singles", desc: "Raw & graded cards" },
  { key: "pack", title: "Packs", desc: "Sealed booster packs" },
  { key: "box", title: "Boxes", desc: "Booster & display boxes" },
  { key: "bundle", title: "Bundles", desc: "ETBs, collections, premium boxes" },
  { key: "lot", title: "Lots", desc: "Bulk, bundles, mystery" },
  { key: "accessory", title: "Accessories", desc: "Sleeves, binders, storage" },
];

export async function generateMetadata({
  params,
}: {
  params: { game: string };
}): Promise<Metadata> {
  const game = normParam(params.game);
  const meta = GAMES[game];
  const canonical = `${site.url}/shop/${encodeURIComponent(game)}`;

  if (!meta) {
    return {
      title: `Shop | ${site.name}`,
      description: "Browse collectibles by game and format.",
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
  }

  const title = `${meta.name} Shop — Singles, Sealed & Deals | ${site.name}`;
  const description = `Shop ${meta.name}: ${meta.desc}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function GameHubPage({ params }: { params: { game: string } }) {
  const game = normParam(params.game);
  const meta = GAMES[game];

  if (!meta) return notFound();

  return (
    <main className="shopShell">
      <header className="shopHeader">
        <h1 className="shopTitle">{meta.name}</h1>
        <p className="shopSubtitle">Pick a format to start shopping.</p>
      </header>

      <section className="shopSection">
        <div className="tileGrid">
          {FORMAT_TILES.map((f) => (
            <Link key={f.key} href={`/shop/${game}/${f.key}`} className="tile">
              <div className="tileTitle">{f.title}</div>
              <div className="tileDesc">{f.desc}</div>
              <div className="tileCta">Browse {f.title} →</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="shopSection">
        <h2 className="shopH2">Fast Filters</h2>
        <div className="chipRow">
          <Link className="chip" href={`/shop/${game}/single?tag=hot-deals`}>🔥 Hot Deals</Link>
          <Link className="chip" href={`/shop/${game}/single?sort=new`}>🆕 New Arrivals</Link>
          <Link className="chip" href={`/shop/${game}/single?graded=true&grader=psa&gradeMin=90`}>🏆 Graded Gems</Link>
          <Link className="chip" href={`/shop/${game}/pack?sealed=true&sort=price_asc`}>📦 Sealed Packs</Link>
        </div>
      </section>
    </main>
  );
}
