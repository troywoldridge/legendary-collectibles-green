// src/app/categories/funko/items/[id]/page.tsx
import "server-only";
import Link from "next/link";
import Image from "next/image";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { CF_ACCOUNT_HASH } from "@/lib/cf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ---------------- types ---------------- */
type ItemRow = {
  id: number;                 // DB bigserial (we don't expose it in URL)
  handle: string;
  title: string | null;

  image: string | null;
  image_url: string | null;
  image_thumb_url: string | null;
  cf_image_id: string | null;
  image_cf_id: string | null;
  image_source: string | null;

  brand: string | null;
  number: string | null;
  franchise: string | null;
  category: string | null;
  series: string[] | null;

  variants: any | null;       // JSONB (unknown shape)
  external_url: string | null;

  created_at: string | null;
  updated_at: string | null;
};

type SearchParams = Record<string, string | string[] | undefined>;

/* ---------------- helpers ---------------- */
function cfUrl(id: string, variant = "productLarge") {
  return `https://imagedelivery.net/${CF_ACCOUNT_HASH}/${id}/${variant}`;
}
function bestImg(r: ItemRow) {
  return (
    (r.cf_image_id && cfUrl(r.cf_image_id)) ||
    (r.image_cf_id && cfUrl(r.image_cf_id)) ||
    r.image ||
    r.image_url ||
    r.image_thumb_url ||
    null
  );
}
function slugify(s?: string | null) {
  if (!s) return "";
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
}

/* ---------------- page ---------------- */
export default async function FunkoItemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;       // /items/[id] where id === handle
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = await searchParams; // reserved for future (display toggles, etc.)

  const wanted = decodeURIComponent(id ?? "").trim();
  const baseHref = `/categories/funko/items/${encodeURIComponent(wanted)}`;

  // exact handle first
  let row =
    (
      await db.execute<ItemRow>(
        sql`SELECT * FROM funko_pops WHERE handle = ${wanted} LIMIT 1`
      )
    ).rows?.[0] ?? null;

  // fallback case/space-insensitive
  if (!row) {
    row =
      (
        await db.execute<ItemRow>(
          sql`SELECT * FROM funko_pops WHERE lower(trim(handle)) = lower(${wanted}) LIMIT 1`
        )
      ).rows?.[0] ?? null;
  }

  if (!row) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold text-white">Item not found</h1>
        <p className="text-white/70 text-sm break-all">
          Tried handle: <code>{wanted}</code>
        </p>
        <div className="flex gap-4">
          <Link href="/categories/funko/items" className="text-sky-300 hover:underline">
            ← Back to all items
          </Link>
          <Link href="/categories/funko/sets" className="text-sky-300 hover:underline">
            ← Browse series
          </Link>
        </div>
      </section>
    );
  }

  const hero = bestImg(row);
  const series = (row.series ?? []).filter(Boolean);

  return (
    <article className="grid gap-6 md:grid-cols-2">
      {/* image */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-2 overflow-hidden">
        <div className="relative w-full" style={{ aspectRatio: "3 / 4" }}>
          {hero ? (
            <Image
              src={hero}
              alt={row.title ?? row.handle}
              fill
              unoptimized
              className="object-contain"
              sizes="(max-width: 768px) 100vw, 50vw"
              priority
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-white/70">No image</div>
          )}
        </div>
      </div>

      {/* details */}
      <div className="grid gap-4">
        {/* top links */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-white/80">
            {series.length > 0 && (
              <>
                Series:&nbsp;
                <span className="inline-flex flex-wrap gap-1.5 align-middle">
                  {series.map((s, i) => (
                    <Link
                      key={i}
                      href={`/categories/funko/sets/${encodeURIComponent(slugify(s))}`}
                      className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-white/85 hover:bg-white/10"
                      title={s}
                    >
                      {s}
                    </Link>
                  ))}
                </span>
              </>
            )}
          </div>

          {/* optional external source */}
          {row.external_url && (
            <a
              href={row.external_url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-sky-300 hover:underline"
            >
              View at source →
            </a>
          )}
        </div>

        {/* headline */}
        <h1 className="text-2xl font-bold text-white">{row.title ?? row.handle}</h1>

        {/* quick facts */}
        <div className="grid grid-cols-2 gap-2 text-sm text-white/90">
          {row.number && (
            <div>
              <span className="text-white/70">Number:</span> {row.number}
            </div>
          )}
          {row.brand && (
            <div>
              <span className="text-white/70">Brand:</span> {row.brand}
            </div>
          )}
          {row.franchise && (
            <div>
              <span className="text-white/70">Franchise:</span> {row.franchise}
            </div>
          )}
          {row.category && (
            <div>
              <span className="text-white/70">Category:</span> {row.category}
            </div>
          )}
          {row.image_source && (
            <div className="col-span-2">
              <span className="text-white/70">Image source:</span> {row.image_source}
            </div>
          )}
          {(row.created_at || row.updated_at) && (
            <div className="col-span-2 text-xs text-white/60">
              {row.created_at ? `Created: ${row.created_at}` : ""}
              {row.created_at && row.updated_at ? " • " : ""}
              {row.updated_at ? `Updated: ${row.updated_at}` : ""}
            </div>
          )}
        </div>

        {/* variants (raw JSON) */}
        {row.variants && (
          <section className="rounded-lg border border-white/10 bg-white/5 p-3">
            <h2 className="font-semibold text-white">Variants</h2>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words text-xs text-white/85">
              {JSON.stringify(row.variants, null, 2)}
            </pre>
          </section>
        )}

        {/* back links */}
        <div className="mt-2 flex gap-4">
          <Link href="/categories/funko/items" className="text-sky-300 hover:underline">
            ← Back to items
          </Link>
          {series.length > 0 && (
            <Link
              href={`/categories/funko/sets/${encodeURIComponent(slugify(series[0]))}`}
              className="text-sky-300 hover:underline"
            >
              ← Back to series
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
