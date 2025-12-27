import Link from "next/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function MtgLanding() {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Magic: The Gathering</h1>
        <div className="text-sm text-white/80">
          Browse sets, search cards, and view pricing.
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Link
          href="/categories/mtg/sets"
          prefetch={false}
          className="rounded-xl border border-white/10 bg-white/5 p-4 text-white hover:bg-white/10 hover:border-white/20 transition"
        >
          <div className="font-semibold">Browse Sets</div>
          <div className="text-sm text-white/70 mt-1">All MTG sets</div>
        </Link>

        <Link
          href="/categories/mtg/cards"
          prefetch={false}
          className="rounded-xl border border-white/10 bg-white/5 p-4 text-white hover:bg-white/10 hover:border-white/20 transition"
        >
          <div className="font-semibold">Search Cards</div>
          <div className="text-sm text-white/70 mt-1">Filters + prices</div>
        </Link>

        <Link
          href="/categories/mtg/top-pricecharting"
          prefetch={false}
          className="rounded-xl border border-white/10 bg-white/5 p-4 text-white hover:bg-white/10 hover:border-white/20 transition"
        >
          <div className="font-semibold">Top (PriceCharting)</div>
          <div className="text-sm text-white/70 mt-1">Popular list</div>
        </Link>
      </div>
    </section>
  );
}
