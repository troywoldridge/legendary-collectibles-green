// src/app/shop/[game]/[format]/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ProductGrid from "@/components/shop/ProductGrid";
import ShopFilters from "@/components/shop/ShopFilters";
import { site } from "@/config/site";

const ALLOWED_GAMES = new Set(["pokemon", "yugioh", "mtg"]);
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

  const base = (site?.url ?? "http://localhost:3000").replace(/\/$/, "");
  const res = await fetch(`${base}/api/shop/products?${query.toString()}`, {
    cache: "no-store",
  });

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
  const description = `Shop ${g} ${f}. Filter by graded, sealed, condition, and price to find the best deals.`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical },
    twitter: { card: "summary_large_image", title, description },
  };
}

export async function generateStaticParams() {
  const games = ["pokemon", "yugioh", "mtg"];
  const formats = ["single", "pack", "box", "bundle", "lot", "accessory"];

  const out: { game: string; format: string }[] = [];
  for (const game of games) {
    for (const format of formats) out.push({ game, format });
  }
  return out;
}


export default async function ListingPage({
  params,
  searchParams,
}: {
  params: { game: string; format: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
 function normParam(s: string) {
  try {
    return decodeURIComponent(s).trim().toLowerCase();
  } catch {
    return String(s).trim().toLowerCase();
  }
}

const game = normParam(params.game);
const format = normParam(params.format);


  if (!ALLOWED_GAMES.has(game) || !ALLOWED_FORMATS.has(format)) return notFound();

  const data = await fetchProducts({ game, format, searchParams });

  const g = gameLabel(game);
  const f = formatLabel(format);

  return (
    <main className="shopShell">
      <header className="shopHeader">
        <h1 className="shopTitle">
          {g} {f}
        </h1>
        <p className="shopSubtitle">
          {data.total.toLocaleString()} item{data.total === 1 ? "" : "s"} · refine filters to find gems fast
        </p>
      </header>

      <div className="shopLayout">
        <aside className="shopSidebar">
          <ShopFilters game={game} format={format} />
        </aside>

        <section className="shopMain">
          <ProductGrid items={data.items} total={data.total} page={data.page} limit={data.limit} />

          {data.total === 0 ? (
            <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 text-white/80">
              No items match these filters. Try removing “graded” or adjusting price range, or{" "}
              <Link className="text-sky-300 hover:underline" href={`/shop/${game}`}>
                browse all {g}
              </Link>
              .
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
