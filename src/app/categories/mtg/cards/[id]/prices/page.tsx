import "server-only";

import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { site } from "@/config/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Record<string, string | string[] | undefined>;
type Currency = "USD" | "EUR";

type SetHeaderRow = {
  code: string;
  name: string | null;
  released_at: string | null;
  set_type: string | null;
};

type AggRow = {
  cards_in_set: number;

  avg_usd: string | null;
  avg_usd_foil: string | null;
  avg_usd_etched: string | null;
  avg_eur: string | null;
  avg_eur_foil: string | null;
  avg_tix: string | null;
};

function absUrl(path: string) {
  const base = (site?.url ?? "https://legendary-collectibles.com").replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function readCurrency(sp: SearchParams): Currency {
  const raw = (Array.isArray(sp?.currency) ? sp.currency[0] : sp?.currency)?.toUpperCase();
  return raw === "EUR" ? "EUR" : "USD";
}

function withParam(baseHref: string, key: string, val: string) {
  const u = new URL(baseHref, "https://x/");
  u.searchParams.set(key, val);
  return u.pathname + (u.search ? u.search : "");
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function fmtMoney(v: unknown, currency: Currency) {
  const n = toNum(v);
  if (n == null || n <= 0) return "—";
  const sym = currency === "EUR" ? "€" : "$";
  return `${sym}${n.toFixed(2)}`;
}

function fmtTix(v: unknown) {
  const n = toNum(v);
  if (n == null || n <= 0) return "—";
  return n.toFixed(2);
}

async function getSetHeader(setCode: string): Promise<SetHeaderRow | null> {
  return (
    (
      await db.execute<SetHeaderRow>(sql`
        SELECT
          s.code,
          s.name,
          COALESCE(TO_CHAR(s.released_at,'YYYY-MM-DD'), NULL) AS released_at,
          s.set_type
        FROM public.scryfall_sets s
        WHERE LOWER(s.code) = LOWER(${setCode})
        LIMIT 1
      `)
    ).rows?.[0] ?? null
  );
}

async function getSetAgg(setCode: string): Promise<AggRow> {
  const row =
    (
      await db.execute<AggRow>(sql`
        SELECT
          COUNT(*)::int AS cards_in_set,

          AVG(COALESCE(e.effective_usd,        l.usd))::text        AS avg_usd,
          AVG(COALESCE(e.effective_usd_foil,   l.usd_foil))::text   AS avg_usd_foil,
          AVG(COALESCE(e.effective_usd_etched, l.usd_etched))::text AS avg_usd_etched,
          AVG(COALESCE(e.effective_eur,        l.eur))::text        AS avg_eur,
          AVG(COALESCE(e.effective_eur_foil,   l.eur_foil))::text   AS avg_eur_foil,
          AVG(COALESCE(e.effective_tix,        l.tix))::text        AS avg_tix
        FROM public.scryfall_cards_raw c
        LEFT JOIN public.mtg_prices_effective e
          ON e.scryfall_id = c.id
        LEFT JOIN public.mtg_prices_scryfall_latest l
          ON l.scryfall_id = c.id
        WHERE LOWER(c.set_code) = LOWER(${setCode})
      `)
    ).rows?.[0] ?? null;

  return (
    row ?? {
      cards_in_set: 0,
      avg_usd: null,
      avg_usd_foil: null,
      avg_usd_etched: null,
      avg_eur: null,
      avg_eur_foil: null,
      avg_tix: null,
    }
  );
}

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const setCode = decodeURIComponent(params.id ?? "").trim();
  const canonical = absUrl(`/categories/mtg/sets/${encodeURIComponent(setCode)}/prices`);

  const header = await getSetHeader(setCode);

  if (!header) {
    return {
      title: `MTG Set Not Found | ${site.name}`,
      description: "We couldn’t find that MTG set. Browse sets and try again.",
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
  }

  const title = `${header.name ?? setCode.toUpperCase()} (${setCode.toUpperCase()}) — MTG Set Prices | ${site.name}`;
  const description = `Average market prices for cards in ${header.name ?? setCode.toUpperCase()} (${setCode.toUpperCase()}).`;

  return { title, description, alternates: { canonical } };
}

export default async function MtgSetPricesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id: rawId } = await params;
  const sp = await searchParams;

  const setCode = decodeURIComponent(rawId ?? "").trim();
  const currency: Currency = readCurrency(sp);

  const baseSetHref = `/categories/mtg/sets/${encodeURIComponent(setCode)}`;
  const baseHref = `${baseSetHref}/prices`;

  const [header, agg] = await Promise.all([getSetHeader(setCode), getSetAgg(setCode)]);

  if (!header) {
    const canonical = absUrl(`/categories/mtg/sets/${encodeURIComponent(setCode)}/prices`);
    return (
      <section className="space-y-6">
        <Script
          id="mtg-set-prices-notfound-jsonld"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebPage",
              url: canonical,
              name: "MTG Set Prices Not Found",
            }),
          }}
        />
        <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm text-white">
          <h1 className="text-2xl font-bold">Set not found</h1>
          <p className="mt-2 text-sm text-white/70">
            Looked up set code: <code className="text-white">{setCode}</code>
          </p>
          <Link href="/categories/mtg/sets" className="mt-4 inline-block text-sky-300 hover:underline">
            ← Back to MTG sets
          </Link>
        </div>
      </section>
    );
  }

  const canonical = absUrl(`/categories/mtg/sets/${encodeURIComponent(setCode)}/prices`);

  const breadcrumbsJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absUrl("/") },
      { "@type": "ListItem", position: 2, name: "Categories", item: absUrl("/categories") },
      { "@type": "ListItem", position: 3, name: "MTG Sets", item: absUrl("/categories/mtg/sets") },
      { "@type": "ListItem", position: 4, name: `${header.name ?? setCode.toUpperCase()}`, item: absUrl(baseSetHref) },
      { "@type": "ListItem", position: 5, name: "Prices", item: canonical },
    ],
  };

  return (
    <section className="space-y-6">
      <Script
        id="mtg-set-prices-breadcrumbs-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbsJsonLd) }}
      />

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            MTG Set Prices • {header.name ?? setCode.toUpperCase()} ({setCode.toUpperCase()})
          </h1>
          <div className="text-sm text-white/80">
            {agg.cards_in_set.toLocaleString()} cards •{" "}
            {header.released_at ? `Released ${header.released_at}` : "Release date —"}{" "}
            {header.set_type ? `• ${header.set_type}` : ""}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="rounded-md border border-white/20 bg-white/10 p-1 text-sm text-white">
            <span className="px-2">Currency:</span>
            <Link
              href={withParam(baseHref, "currency", "USD")}
              className={`rounded px-2 py-1 ${currency === "USD" ? "bg-white/20" : "hover:bg-white/10"}`}
            >
              USD
            </Link>
            <Link
              href={withParam(baseHref, "currency", "EUR")}
              className={`ml-1 rounded px-2 py-1 ${currency === "EUR" ? "bg-white/20" : "hover:bg-white/10"}`}
            >
              EUR
            </Link>
          </div>

          <Link href={baseSetHref} className="text-sky-300 hover:underline">
            ← Back to set
          </Link>
        </div>
      </div>

      <div className="max-w-3xl space-y-2 text-sm text-white/80">
        <p>
          These are <span className="text-white">average</span> prices across cards in the set,
          using your effective pricing first and Scryfall latest as fallback.
        </p>
      </div>

      <div className="rounded-xl border border-white/15 bg-white/5 p-5 text-white/90 backdrop-blur-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Averages</h2>
          <div className="text-xs text-white/70">Values shown in {currency}</div>
        </div>

        <ul className="divide-y divide-white/10">
          {currency === "USD" ? (
            <>
              <li className="flex items-center justify-between py-2">
                <span>USD</span>
                <span className="font-medium">{fmtMoney(agg.avg_usd, "USD")}</span>
              </li>
              <li className="flex items-center justify-between py-2">
                <span>USD Foil</span>
                <span className="font-medium">{fmtMoney(agg.avg_usd_foil, "USD")}</span>
              </li>
              <li className="flex items-center justify-between py-2">
                <span>USD Etched</span>
                <span className="font-medium">{fmtMoney(agg.avg_usd_etched, "USD")}</span>
              </li>
            </>
          ) : (
            <>
              <li className="flex items-center justify-between py-2">
                <span>EUR</span>
                <span className="font-medium">{fmtMoney(agg.avg_eur, "EUR")}</span>
              </li>
              <li className="flex items-center justify-between py-2">
                <span>EUR Foil</span>
                <span className="font-medium">{fmtMoney(agg.avg_eur_foil, "EUR")}</span>
              </li>
            </>
          )}

          <li className="flex items-center justify-between py-2">
            <span>TIX</span>
            <span className="font-medium">{fmtTix(agg.avg_tix)}</span>
          </li>
        </ul>
      </div>
    </section>
  );
}
