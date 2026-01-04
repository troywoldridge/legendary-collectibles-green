import "server-only";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { site } from "@/config/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DeptKey = "pokemon" | "yugioh" | "mtg" | "accessories";

type Dept = {
  name: string;
  desc: string;
  categories: { key: string; name: string; desc: string }[];
};

const DEPTS: Record<DeptKey, Dept> = {
  pokemon: {
    name: "Pokémon",
    desc: "Singles, graded cards, sealed packs and boxes.",
    categories: [
      { key: "singles", name: "Singles", desc: "Raw Pokémon singles" },
      { key: "graded", name: "Graded", desc: "PSA/BGS/CGC graded Pokémon singles" },
      { key: "packs", name: "Booster Packs", desc: "Sealed booster packs" },
      { key: "boxes", name: "Booster Boxes", desc: "Sealed booster/display boxes" },
      { key: "bundles", name: "Bundles / ETBs", desc: "ETBs, collections, bundles" },
      { key: "accessories", name: "Accessories", desc: "Supplies for Pokémon collecting" },
    ],
  },

  yugioh: {
    name: "Yu-Gi-Oh!",
    desc: "Singles, graded cards, sealed product.",
    categories: [
      { key: "singles", name: "Singles", desc: "Raw Yu-Gi-Oh singles" },
      { key: "graded", name: "Graded", desc: "PSA/BGS/CGC graded Yu-Gi-Oh singles" },
      { key: "packs", name: "Blister / Booster Packs", desc: "Sealed packs" },
      { key: "boxes", name: "Booster Boxes", desc: "Sealed booster boxes" },
      { key: "bundles", name: "Structure / Bundles", desc: "Structure decks and bundles" },
      { key: "accessories", name: "Accessories", desc: "Supplies for Yu-Gi-Oh collecting" },
    ],
  },

  mtg: {
    name: "Magic: The Gathering",
    desc: "Singles, graded cards, sealed product.",
    categories: [
      { key: "singles", name: "Singles", desc: "Raw MTG singles" },
      { key: "graded", name: "Graded", desc: "PSA/BGS/CGC graded MTG singles" },
      { key: "packs", name: "Booster Packs", desc: "Sealed booster packs" },
      { key: "boxes", name: "Booster Boxes", desc: "Sealed booster boxes" },
      { key: "bundles", name: "Bundles", desc: "Bundles and sealed collections" },
      { key: "accessories", name: "Accessories", desc: "Supplies for MTG play and collecting" },
    ],
  },

  accessories: {
    name: "Accessories",
    desc: "Sleeves, binders, deck boxes, storage and more.",
    categories: [{ key: "all", name: "All Accessories", desc: "Everything accessory-related" }],
  },
};

function norm(s: string) {
  return (s || "").trim().toLowerCase();
}

export async function generateMetadata({ params }: { params: { department: string } }): Promise<Metadata> {
  const d = norm(params.department) as DeptKey;
  const dept = DEPTS[d];
  const canonical = `${site.url}/shop/${encodeURIComponent(params.department)}`;

  if (!dept) {
    return {
      title: `Shop | ${site.name}`,
      robots: { index: false, follow: true },
      alternates: { canonical },
    };
  }

  return {
    title: `${dept.name} Shop | ${site.name}`,
    description: dept.desc,
    alternates: { canonical },
  };
}

export default function DepartmentPage({ params }: { params: { department: string } }) {
  const d = norm(params.department) as DeptKey;
  const dept = DEPTS[d];
  if (!dept) return notFound();

  return (
    <main className="shopShell">
      <header className="shopHeader">
        <h1 className="shopTitle">{dept.name}</h1>
        <p className="shopSubtitle">{dept.desc}</p>

        <div className="chipRow">
          <Link className="chip" href="/shop">
            ← Back to Shop
          </Link>
        </div>
      </header>

      <section className="shopSection">
        <div className="tileGrid">
          {dept.categories.map((c) => (
            <Link key={c.key} href={`/shop/${d}/${c.key}`} className="tile">
              <div className="tileTitle">{c.name}</div>
              <div className="tileDesc">{c.desc}</div>
              <div className="tileCta">Browse →</div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
