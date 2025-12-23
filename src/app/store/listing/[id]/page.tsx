// src/app/store/listing/[id]/page.tsx
import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import AddToCartButton from "@/components/store/AddToCartButton";

export const dynamic = "force-dynamic";

type Listing = {
  id: string;
  title: string;
  description: string | null;
  game: string;
  kind: string;
  status: string;
  card_id: string | null;
  set_name: string | null;
  condition: string | null;
  language: string | null;
  grading_company: string | null;
  grade_label: string | null;
  cert_number: string | null;
  price_cents: number;
  currency: string;
  quantity: number;
  ship_weight_grams: number | null;
  primary_image_url: string | null;
  created_at: string;
};

export default async function ListingDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const id = params.id;

  const res = await db.execute<Listing>(sql`
    SELECT
      id,
      title,
      description,
      game,
      kind,
      status,
      card_id,
      set_name,
      condition,
      language,
      grading_company,
      grade_label,
      cert_number,
      price_cents,
      currency,
      quantity,
      ship_weight_grams,
      primary_image_url,
      created_at::text
    FROM public.store_listings
    WHERE id = ${id}::uuid
    LIMIT 1
  `);

  const l = res.rows?.[0];
  if (!l) {
    return (
      <div className="text-white">
        <h1 className="text-2xl font-bold">Listing not found</h1>
        <Link className="mt-3 inline-block text-indigo-300 hover:text-indigo-200" href="/store">
          Back to store →
        </Link>
      </div>
    );
  }

  const price = `$${(l.price_cents / 100).toFixed(2)} ${l.currency}`;

  return (
    <div className="space-y-6 text-white">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs text-white/60">{l.game} • {l.kind}</div>
          <h1 className="mt-1 text-3xl font-extrabold">{l.title}</h1>
          <div className="mt-2 text-xl font-bold">{price}</div>
          <div className="mt-1 text-sm text-white/70">In stock: {l.quantity}</div>
        </div>

        <Link
          className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
          href={`/store/${l.game}`}
        >
          Back to {l.game}
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          <div className="aspect-[4/3] w-full bg-black/20">
            {l.primary_image_url ? (
              <img
                src={l.primary_image_url}
                alt={l.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-white/60">
                No image
              </div>
            )}
          </div>

          {l.description ? (
            <div className="p-4 text-sm text-white/80 whitespace-pre-wrap">
              {l.description}
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h2 className="text-lg font-semibold">Details</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <Row label="Set" value={l.set_name ?? "—"} />
              <Row label="Language" value={l.language ?? "—"} />
              <Row label="Condition" value={l.condition ?? "—"} />
              <Row label="Grading" value={l.grading_company ? `${l.grading_company} ${l.grade_label ?? ""}`.trim() : "—"} />
              <Row label="Cert #" value={l.cert_number ?? "—"} />
              <Row label="Weight" value={l.ship_weight_grams != null ? `${l.ship_weight_grams}g` : "—"} />
            </div>

            <div className="mt-4 flex gap-2">
              <AddToCartButton listingId={l.id} disabled={l.status !== "active" || l.quantity <= 0} />
              {l.card_id ? (
                <Link
                  className="flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-center text-sm hover:bg-white/10"
                  href={`/categories/${l.game}/cards/${l.card_id}`}
                >
                  View card detail →
                </Link>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
            <div className="font-semibold text-white">Checkout is next</div>
            Once cart is UI’d up, this hooks right into Stripe.
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="text-xs text-white/60">{label}</div>
      <div className="mt-1 font-medium">{value}</div>
    </div>
  );
}
