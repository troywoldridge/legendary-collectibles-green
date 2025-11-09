// src/lib/ebay.ts
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export type EbaySnapshot = {
  sample_count: number | null;
  min_cents: number | null;
  p25_cents: number | null;
  median_cents: number | null;
  p75_cents: number | null;
  max_cents: number | null;
  avg_cents: number | null;
  currency: string | null;
  created_at: string | null; // may be null if column doesn't exist
};

async function columnExists(table: string, col: string): Promise<boolean> {
  const r = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${table}
        AND column_name = ${col}
    ) AS exists
  `);
  return Boolean(r.rows?.[0]?.exists);
}

export async function getLatestEbaySnapshot(
  category: "pokemon" | "ygo" | "mtg" | "sports",
  cardId: string,
  segment: "raw" | "graded" | "all" = "all"
): Promise<EbaySnapshot | null> {
  const hasCreatedAt = await columnExists("ebay_price_snapshots", "created_at");
  const hasId = await columnExists("ebay_price_snapshots", "id");

  // shared column list
  const baseCols = sql`
    sample_count, min_cents, p25_cents, median_cents, p75_cents, max_cents, avg_cents, currency
  `;

  if (hasCreatedAt) {
    const q = await db.execute<EbaySnapshot>(sql`
      SELECT
        ${baseCols},
        to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
      FROM ebay_price_snapshots
      WHERE card_id = ${cardId} AND category = ${category} AND segment = ${segment}
      ORDER BY created_at DESC
      LIMIT 1
    `);
    return q.rows?.[0] ?? null;
  }

  if (hasId) {
    const q = await db.execute<EbaySnapshot>(sql`
      SELECT
        ${baseCols},
        NULL::text AS created_at
      FROM ebay_price_snapshots
      WHERE card_id = ${cardId} AND category = ${category} AND segment = ${segment}
      ORDER BY id DESC
      LIMIT 1
    `);
    return q.rows?.[0] ?? null;
  }

  // last-resort: physical tuple order
  const q = await db.execute<EbaySnapshot>(sql`
    SELECT
      ${baseCols},
      NULL::text AS created_at
    FROM ebay_price_snapshots
    WHERE card_id = ${cardId} AND category = ${category} AND segment = ${segment}
    ORDER BY ctid DESC
    LIMIT 1
  `);
  return q.rows?.[0] ?? null;
}

// Optional helper if you want it elsewhere
export function toMoneyUSDFromCents(c?: number | null) {
  return c == null ? "—" : `$${(c / 100).toFixed(2)}`;
}
