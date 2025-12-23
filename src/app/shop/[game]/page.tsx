// src/app/shop/[game]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";

const GAMES: Record<string, { name: string }> = {
  pokemon: { name: "Pokémon" },
  yugioh: { name: "Yu-Gi-Oh!" },
  mtg: { name: "Magic: The Gathering" },
  sports: { name: "Sports Cards" },
};

const FORMAT_TILES = [
  { key: "single", title: "Singles", desc: "Raw & graded cards" },
  { key: "pack", title: "Packs", desc: "Sealed booster packs" },
  { key: "box", title: "Boxes", desc: "Booster & display boxes" },
  { key: "bundle", title: "Bundles", desc: "ETBs, collections, premium boxes" },
  { key: "lot", title: "Lots", desc: "Bulk, bundles, mystery" },
];

export default function GameHubPage({ params }: { params: { game: string } }) {
  const game = params.game;
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
