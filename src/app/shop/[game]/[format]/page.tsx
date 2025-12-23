// src/app/shop/[game]/[format]/page.tsx
import { notFound } from "next/navigation";
import ProductGrid from "@/components/shop/ProductGrid";
import ShopFilters from "@/components/shop/ShopFilters";

const ALLOWED_GAMES = new Set(["pokemon", "yugioh", "mtg", "sports"]);
const ALLOWED_FORMATS = new Set(["single", "pack", "box", "bundle", "lot", "accessory"]);

function qs(searchParams: Record<string, string | string[] | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (typeof v === "string" && v.length) p.set(k, v);
  }
  return p.toString();
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

  // Pass-through params we support from UI
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

  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const res = await fetch(`${base}/api/shop/products?${query.toString()}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to load products");
  return res.json() as Promise<{ items: any[]; total: number; page: number; limit: number }>;
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
