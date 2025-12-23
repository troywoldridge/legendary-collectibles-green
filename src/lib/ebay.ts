// src/lib/ebay.ts
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
  category: string; // maps to market_items.game (pokemon|mtg|yugioh...)
  cardId: string;   // external id for the item (e.g. "bw10-26")
  segment?: string; // kept for API compatibility (unused)
}): Promise<EbaySnapshot | null> {
  const res = await db.execute<{
    price_cents: number | null;
    currency: string | null;
    confidence: string | null;
    as_of_date: string | null;
    source: string | null;
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
    JOIN public.market_items mi
      ON mi.id = mie.market_item_id
    JOIN public.market_prices_current mpc
      ON mpc.market_item_id = mie.market_item_id
    WHERE mi.game = ${opts.category}
      AND mie.external_id = ${opts.cardId}
      AND mie.source = 'ebay'
      AND mpc.source = 'ebay'
    ORDER BY mpc.updated_at DESC
    LIMIT 1
  `);

  const row = res.rows?.[0] ?? null;
  if (!row) return null;

  return {
    createdAt: row.updated_at ?? null,
    price_cents: row.price_cents ?? null,
    currency: row.currency ?? "USD",
    confidence: row.confidence ?? null,
    as_of_date: row.as_of_date ?? null,
    source: row.source ?? "ebay",
  };
}
