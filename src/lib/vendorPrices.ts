// src/lib/vendorPrices.ts
import "server-only";
import { db } from "@/lib/db";
import { tcgVendorMaps } from "@/lib/db/schema";
import { and, eq, inArray, SQL } from "drizzle-orm";

export type VendorKey = "tcgplayer" | "cardmarket" | "ebay" | "amazon" | "coolstuffinc";
export type CategoryKey = "pokemon" | "yugioh" | "mtg";
export type VendorSnapshot = { value: number | null; currency: "USD" | "EUR"; url: string | null };
export type VendorMap = Record<VendorKey, VendorSnapshot>;

const baseVendors: VendorMap = {
  tcgplayer:    { value: null, currency: "USD", url: null },
  cardmarket:   { value: null, currency: "EUR", url: null },
  ebay:         { value: null, currency: "USD", url: null },
  amazon:       { value: null, currency: "USD", url: null },
  coolstuffinc: { value: null, currency: "USD", url: null },
};

// Drizzle numeric is string -> convert for insert/update
const numToPg = (v: number | null) => (v == null ? null : v.toFixed(2));

export async function getVendorPricesForCard(
  category: CategoryKey,
  cardId: string,
  vendors: readonly VendorKey[] = ["ebay", "amazon", "coolstuffinc"],
  opts?: { game?: string }
): Promise<VendorMap> {
  const wanted = [...vendors] as VendorKey[];

  // Build WHERE safely
  const conds: (SQL | undefined)[] = [
    eq(tcgVendorMaps.category, category),
    eq(tcgVendorMaps.cardId, cardId),
    inArray(tcgVendorMaps.vendor, wanted),
  ];
  if (opts?.game) conds.push(eq(tcgVendorMaps.game, opts.game));
  const where = and(...(conds.filter(Boolean) as SQL[]));

  let rows: Array<{
    vendor: string;
    currency: string | null;
    value: string | null;     // numeric as string
    url: string | null;
  }> = [];

  try {
    rows = await db
      .select({
        vendor: tcgVendorMaps.vendor,
        currency: tcgVendorMaps.currency,
        value: tcgVendorMaps.value,   // string from driver
        url: tcgVendorMaps.url,
      })
      .from(tcgVendorMaps)
      .where(where);
  } catch (err: any) {
    // Table or column missing → return defaults (prevents crashing pages)
    if (err?.code === "42P01" /* undefined_table */ || err?.code === "42703" /* undefined_column */) {
      return { ...baseVendors };
    }
    throw err;
  }

  const out: VendorMap = { ...baseVendors };
  for (const r of rows) {
    const key = r.vendor as VendorKey;
    if (key in out) {
      out[key] = {
        value: r.value != null ? Number(r.value) : null,
        currency: r.currency?.toUpperCase() === "EUR" ? "EUR" : "USD",
        url: r.url ?? null,
      };
    }
  }
  return out;
}

export async function upsertVendorPrice(args: {
  category: CategoryKey;
  cardId: string;
  vendor: VendorKey;
  currency: "USD" | "EUR";
  value: number | null;
  url?: string | null;
  ident?: string | null;
  query?: string | null;
  urlHint?: string | null;
  game?: string; // defaults to category
}) {
  const {
    category, cardId, vendor, currency, value,
    url = null, ident = null, query = null, urlHint = null,
    game = category,
  } = args;

  await db
    .insert(tcgVendorMaps)
    .values({
      category,
      game,
      cardId,
      vendor,
      ident,
      currency,
      value: numToPg(value),  // numeric -> string
      query,
      urlHint,
      url,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [tcgVendorMaps.category, tcgVendorMaps.cardId, tcgVendorMaps.vendor],
      set: {
        game,
        ident,
        currency,
        value: numToPg(value), // numeric -> string
        query,
        urlHint,
        url,
        updatedAt: new Date(),
      },
    });
}
