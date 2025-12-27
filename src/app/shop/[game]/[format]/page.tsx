// src/app/shop/[game]/[format]/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProductGrid from "@/components/shop/ProductGrid";
import ShopFilters from "@/components/shop/ShopFilters";
import { site } from "@/config/site";

const ALLOWED_GAMES = new Set(["pokemon", "yugioh", "mtg", "sports"]);
const ALLOWED_FORMATS = new Set(["single", "pack", "box", "bundle", "lot", "accessory"]);

function formatLabel(format: string) {
  switch (format) {
    case "single":
      return "Singles";
    case "pack":
      return "Packs";
    case "box":
      return "Boxes";
    case "bundle":
      return "Bundles";
    case "lot":
      return "Lots";
    case "accessory":
      return "Accessories";
    default:
      return format.toUpperCase();
  }
}
function gameLabel(game: string) {
  switch (game) {
    case "pokemon":
      return "Pokémon";
    case "yugioh":
      return "Yu-Gi-Oh!";
    case "mtg":
      return "Magic: The Gathering";
    case "sports":
      return "Sports Cards";
    default:
      return game.toUpperCase();
  }
}

async function fetchProducts(args: {
  game: string;
  format: string;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { game, format, searchParams } = args;

  const query = new URLSearchParams();
  query.set("game", game);
  query.set("format", format);

  const allow = [
    "sealed",
    "graded",
    "grader",
    "gradeMin",
    "condition",
    "tag",
    "q",
    "priceMin",
    "priceMax",
    "sort",
    "page",
    "limit",
  ];
  for (const k of allow) {
    const v = searchParams[k];
    if (typeof v === "string" && v.length) query.set(k, v);
  }

  // Use site.url server-side so it matches production.
  const base = (site?.url ?? "http://localhost:3000").replace(/\/$/, "");
  const res = await fetch(`${base}/api/shop/products?${query.toString()}`, { cache: "no-store" });

  if (!res.ok) throw new Error("Failed to load products");
  return res.json() as Promise<{ items: any[]; total: number; page: number; limit: number }>;
}

export async function generateMetadata({
  params,
}: {
  params: { game: string; format: string };
}): Promise<Metadata> {
  const { game, format } = params;

  const canonical = `${site.url}/shop/${encodeURIComponent(game)}/${encodeURIComponent(format)}`;

  if (!ALLOWED_GAMES.has(game) || !ALLOWED_FORMATS.has(format)) {
    return {
      title: `Shop | ${site.name}`,
      description: "Browse collectibles by game and format.",
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
  }

  const g = gameLabel(game);
  const f = formatLabel(format);
  const title = `${g} ${f} — Shop | ${site.name}`;
  const description = `Shop ${g} ${f}. Filter by graded, sealed, price, and more to find the best deals.`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ListingPage({
  params,
  searchParams,
}: {
  params: { game: string; format: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { game, format } = params;

  if (!ALLOWED_GAMES.has(game) || !ALLOWED_FORMATS.has(format)) return notFound();

  const data = await fetchProducts({ game, format, searchParams });

  return (
    <main className="shopShell">
      <header className="shopHeader">
        <h1 className="shopTitle">
          {game.toUpperCase()} / {format.toUpperCase()}
        </h1>
        <p className="shopSubtitle">
          {data.total.toLocaleString()} items · refine filters to find gems fast
        </p>
      </header>

      <div className="shopLayout">
        <aside className="shopSidebar">
          <ShopFilters game={game} format={format} />
        </aside>

        <section className="shopMain">
          <ProductGrid items={data.items} total={data.total} page={data.page} limit={data.limit} />
        </section>
      </div>
    </main>
  );
}
