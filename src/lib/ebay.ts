import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * Compatibility layer for legacy card pages that still expect
 * "latest eBay snapshot" style data.
 *
 * Reads from unified market_* tables.
 */

export type EbaySnapshot = {
  /** ISO timestamp if available (from market_prices_current.updated_at). */
  createdAt?: string | null;

  /** Keep legacy naming for callers */
  price_cents: number | null;
  currency: string;
  confidence: string | null;

  /** ISO date string (YYYY-MM-DD) */
  as_of_date: string | null;

  source: string;
};

export async function getLatestEbaySnapshot(opts: {
  category: string;
  cardId: string;
  segment?: string; // kept for API compatibility
}): Promise<EbaySnapshot | null> {
  const row =
    (
      await db.execute<{
        price_cents: number | null;
        currency: string;
        confidence: string | null;
        as_of_date: string | null;
        source: string;
        updated_at: string | null;
      }>(sql`
        SELECT
          mpc.price_cents,
          mpc.currency,
          mpc.confidence,
          mpc.as_of_date::text AS as_of_date,
          mpc.source,
          mpc.updated_at::text AS updated_at
        FROM public.market_item_external_ids mie
        JOIN public.market_prices_current mpc
          ON mpc.market_item_id = mie.market_item_id
        WHERE mie.category = ${opts.category}
          AND mie.external_id = ${opts.cardId}
          AND mpc.source = 'ebay'
        LIMIT 1
      `)
    ).rows?.[0] ?? null;

  if (!row) return null;

  return {
    createdAt: row.updated_at ?? null,
    price_cents: row.price_cents ?? null,
    currency: row.currency,
    confidence: row.confidence ?? null,
    as_of_date: row.as_of_date ?? null,
    source: row.source,
  };
}
