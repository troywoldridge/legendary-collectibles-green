// src/app/store/[game]/page.tsx
import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const ALLOWED_GAMES = new Set(["pokemon", "yugioh", "magic", "mtg"]);

function normalizeGame(raw: string) {
  const g = (raw || "").toLowerCase();
  if (g === "mtg") return "magic";
  return g;
}

type ListingRow = {
  id: string;
  title: string;
  game: string;
  kind: string;
  condition: string | null;
  grading_company: string | null;
  grade_label: string | null;
  price_cents: number;
  currency: string;
  quantity: number;
  set_name: string | null;
  card_id: string | null;
  primary_image_url: string | null;
  featured: boolean;
  created_at: string;
};

export default async function StoreGamePage({
  params,
  searchParams,
}: {
  params: { game: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const game = normalizeGame(params.game);
  if (!ALLOWED_GAMES.has(game)) {
    return (
      <div className="text-white">
        <h1 className="text-2xl font-bold">Store</h1>
        <p className="mt-2 text-white/70">
          Unknown game: <span className="font-mono">{params.game}</span>
        </p>
      </div>
    );
  }

  const q = typeof searchParams.q === "string" ? searchParams.q.trim() : "";
  const kind = typeof searchParams.kind === "string" ? searchParams.kind.trim() : "all";
  const onlyInStock = (typeof searchParams.stock === "string" ? searchParams.stock : "1") !== "0";

  const res = await db.execute<ListingRow>(sql`
    SELECT
      id,
      title,
      game,
      kind,
      condition,
      grading_company,
      grade_label,
      price_cents,
      currency,
      quantity,
      set_name,
      card_id,
      primary_image_url,
      featured,
      created_at::text
    FROM public.store_listings
    WHERE status = 'active'
      AND game = ${game}
      AND (${onlyInStock}::boolean = false OR quantity > 0)
      AND (${kind} = 'all' OR kind = ${kind})
      AND (
        ${q} = ''
        OR title ILIKE '%' || ${q} || '%'
        OR COALESCE(set_name,'') ILIKE '%' || ${q} || '%'
        OR COALESCE(card_id,'') ILIKE '%' || ${q} || '%'
      )
    ORDER BY featured DESC, created_at DESC
    LIMIT 60
  `);

  const rows = res.rows ?? [];

  return (
    <div className="space-y-6 text-white">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">
            {game === "magic" ? "MTG" : game.charAt(0).toUpperCase() + game.slice(1)} Store
          </h1>
          <p className="mt-1 text-white/70">{rows.length} listings</p>
        </div>

        <Link
          className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
          href="/store"
        >
          Back to Store
        </Link>
      </div>

      {/* filters */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <form className="grid gap-3 sm:grid-cols-3">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search title, set, card id..."
            className="h-10 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white placeholder:text-white/50"
          />

          <select
            name="kind"
            defaultValue={kind}
            className="h-10 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white"
          >
            <option value="all">All types</option>
            <option value="single">Singles</option>
            <option value="sealed">Sealed</option>
            <option value="slab">Graded / Slab</option>
          </select>

          <select
            name="stock"
            defaultValue={onlyInStock ? "1" : "0"}
            className="h-10 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white"
          >
            <option value="1">In stock only</option>
            <option value="0">Include out of stock</option>
          </select>

          <button
            type="submit"
            className="sm:col-span-3 h-10 rounded-xl bg-indigo-600 text-sm font-semibold hover:bg-indigo-500"
          >
            Apply filters
          </button>
        </form>
      </div>

      {/* grid */}
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/70">
          No listings match your filters.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map((l) => (
            <Link
              key={l.id}
              href={`/store/listing/${l.id}`}
              className="group overflow-hidden rounded-xl border border-white/10 bg-white/5 hover:bg-white/10"
            >
              <div className="aspect-[4/3] w-full bg-black/20">
                {l.primary_image_url ? (
                  <img
                    src={l.primary_image_url}
                    alt={l.title}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-white/50">
                    No image
                  </div>
                )}
              </div>

              <div className="p-3">
                <div className="flex items-center justify-between text-xs text-white/60">
                  <span>{l.kind}</span>
                  <span>Qty {l.quantity}</span>
                </div>

                <div className="mt-1 line-clamp-2 text-sm font-semibold">
                  {l.title}
                </div>

                <div className="mt-2 text-sm font-bold">
                  ${(l.price_cents / 100).toFixed(2)} {l.currency}
                </div>

                {(l.grading_company || l.condition) && (
                  <div className="mt-1 text-xs text-white/70">
                    {l.grading_company
                      ? `${l.grading_company} ${l.grade_label ?? ""}`.trim()
                      : l.condition}
                  </div>
                )}

                {/* link back to card detail if we have one */}
                {l.card_id ? (
                  <div className="mt-2 text-xs">
                    <Link
                      className="text-indigo-300 hover:text-indigo-200"
                      href={`/categories/${l.game}/cards/${l.card_id}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      View card details →
                    </Link>
                  </div>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
