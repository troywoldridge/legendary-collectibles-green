// src/app/categories/funko/sets/[id]/prices/page.tsx
import "server-only";
import Link from "next/link";
import Image from "next/image";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { CF_ACCOUNT_HASH } from "@/lib/cf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
type Currency = "USD" | "EUR";

type SetRow = { id: string; name: string | null; logo_url: string | null; symbol_url: string | null; };

const CATEGORY = { label: "Funko Pop", baseListHref: "/categories/funko/sets", bannerCfId: "48efbf88-be1f-4a1f-f3f7-892fe21b5000" };

const cfImageUrl = (id: string, variant = "categoryThumb") =>
  `https://imagedelivery.net/${CF_ACCOUNT_HASH}/${id}/${variant}`;

function readCurrency(sp: SearchParams): Currency {
  const raw = (Array.isArray(sp?.currency) ? sp.currency[0] : sp?.currency)?.toUpperCase();
  return raw === "EUR" ? "EUR" : "USD";
}
function withParam(baseHref: string, key: string, val: string) {
  const u = new URL(baseHref, "https://x/");
  u.searchParams.set(key, val);
  return u.pathname + (u.search ? u.search : "");
}

async function resolveSeriesNameFromSlug(slug: string): Promise<string | null> {
  const row =
    (
      await db.execute<{ series: string }>(sql`
        SELECT t.series
        FROM (
          SELECT DISTINCT unnest(COALESCE(series,'{}'))::text AS series
          FROM funko_pops
        ) t
        WHERE lower(regexp_replace(t.series, '[^a-z0-9]+', '-', 'g')) = lower(${slug})
        LIMIT 1
      `)
    ).rows?.[0] ?? null;
  return row?.series ?? null;
}

async function getSet(setId: string): Promise<SetRow | null> {
  const seriesName =
    (await resolveSeriesNameFromSlug(setId)) || setId.replace(/-/g, " ");

  if (!seriesName) return null;

  const img =
    (
      await db.execute<{ image: string | null }>(sql`
        SELECT image
        FROM funko_pops
        WHERE series @> ARRAY[${seriesName}]::text[]
          AND image IS NOT NULL
        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
        LIMIT 1
      `)
    ).rows?.[0]?.image ?? null;

  return {
    id: setId,
    name: seriesName,
    logo_url: img,
    symbol_url: null,
  };
}

// Placeholder until Funko pricing is implemented.
// Return empty arrays so the UI renders a clear “no data” message.
async function getPriceSummary(_opts: {
  setId: string;
}): Promise<{
  tcgplayerRows: Array<{ label: string; value: string | null }>;
  cardmarketRows: Array<{ label: string; value: string | null }>;
}> {
  return {
    tcgplayerRows: [],
    cardmarketRows: [],
  };
}

export default async function FunkoSetPricesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id: rawId } = await params;
  const sp = await searchParams;

  const setParam = decodeURIComponent(rawId ?? "").trim();
  const baseSetHref = `${CATEGORY.baseListHref}/${encodeURIComponent(setParam)}`;
  const baseHref = `${baseSetHref}/prices`;
  const currency: Currency = readCurrency(sp);

  const setRow = await getSet(setParam);
  if (!setRow) {
    return (
      <section className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Series not found</h1>
        <Link href={CATEGORY.baseListHref} className="text-sky-300 hover:underline">
          ← Back to series
        </Link>
      </section>
    );
  }

  const { tcgplayerRows, cardmarketRows } = await getPriceSummary({ setId: setParam });

  const banner = setRow?.logo_url || setRow?.symbol_url || cfImageUrl(CATEGORY.bannerCfId);

  // very tiny local formatter so page stands alone
  const fmt = (v: string | number | null | undefined) => {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return v ?? "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  };

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="relative h-20 w-36 shrink-0 rounded-lg bg-white/5 ring-1 ring-white/10 overflow-hidden">
            <Image
              src={banner}
              alt={setRow?.name ?? setParam}
              fill
              unoptimized
              className="object-contain"
              sizes="144px"
              priority
            />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">
              {CATEGORY.label}: {setRow?.name ?? setParam}
            </h1>
            <div className="text-sm text-white/80">Series price overview</div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="rounded-md border border-white/20 bg-white/10 p-1 text-sm text-white">
            <span className="px-2">Currency:</span>
            <Link
              href={withParam(baseHref, "currency", "USD")}
              className={`rounded px-2 py-1 ${
                currency === "USD" ? "bg-white/20" : "hover:bg-white/10"
              }`}
            >
              USD
            </Link>
            <Link
              href={withParam(baseHref, "currency", "EUR")}
              className={`ml-1 rounded px-2 py-1 ${
                currency === "EUR" ? "bg-white/20" : "hover:bg-white/10"
              }`}
            >
              EUR
            </Link>
          </div>
          <Link href={baseSetHref} className="text-sky-300 hover:underline">
            ← Back to series
          </Link>
        </div>
      </div>

      {/* TCGplayer box */}
      <div className="rounded-xl border border-white/15 bg-white/5 p-5 text-white/90 backdrop-blur-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">TCGplayer</h2>
          <div className="text-xs text-white/70">Values shown in {currency}</div>
        </div>
        {tcgplayerRows.length === 0 ? (
          <div className="rounded-md border border-white/10 bg-white/5 p-3 text-sm text-white/80">
            No TCGplayer price rows yet.
          </div>
        ) : (
          <ul className="divide-y divide-white/10">
            {tcgplayerRows.map((r, i) => (
              <li key={i} className="flex items-center justify-between py-2">
                <span className="text-white/90">{r.label}</span>
                <span className="font-medium">{r.value ? fmt(r.value) : "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Cardmarket box */}
      <div className="rounded-xl border border-white/15 bg-white/5 p-5 text-white/90 backdrop-blur-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Cardmarket</h2>
          <div className="text-xs text-white/70">Values shown in {currency}</div>
        </div>
        {cardmarketRows.length === 0 ? (
          <div className="rounded-md border border-white/10 bg-white/5 p-3 text-sm text-white/80">
            No Cardmarket price rows yet.
          </div>
        ) : (
          <ul className="divide-y divide-white/10">
            {cardmarketRows.map((r, i) => (
              <li key={i} className="flex items-center justify-between py-2">
                <span className="text-white/90">{r.label}</span>
                <span className="font-medium">{r.value ? fmt(r.value) : "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
