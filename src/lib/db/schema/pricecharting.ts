// src/lib/pricecharting.ts
import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/* =============================
   TYPES
   ============================= */

export type PricechartingCategory = "pokemon" | "mtg" | "yugioh";

export type PricechartingCardRow = {
  category: PricechartingCategory;
  pricecharting_id: string;
  product_name: string;
  console_name: string | null;
  release_date: string | null;

  loose_price_cents: number | null;
  cib_price_cents: number | null;
  new_price_cents: number | null;
  graded_price_cents: number | null;
  box_only_price_cents: number | null;
  manual_only_price_cents: number | null;
  bgs_10_price_cents: number | null;
  condition_17_price_cents: number | null;
  condition_18_price_cents: number | null;
};

export type PricechartingGradeSnapshot = {
  category: PricechartingCategory;
  card_id: string;
  pricecharting_id: number | null;
  currency: string;
  loose_cents: number | null;
  graded_cents: number | null;
  cib_cents: number | null;
  new_cents: number | null;
  box_only_cents: number | null;
  manual_only_cents: number | null;
  bgs10_cents: number | null;
  cgc10_cents: number | null;
  sgc10_cents: number | null;
  captured_at: string; // cast to text in SQL
};

/* =============================
   UTILS
   ============================= */

export function centsToUsd(
  cents: number | null | undefined,
): string | null {
  if (cents == null) return null;
  const dollars = cents / 100;
  if (!Number.isFinite(dollars)) return null;
  return `$${dollars.toFixed(2)}`;
}

/* =============================
   LATEST SNAPSHOTS PER CARD
   ============================= */

/**
 * Get the latest PriceCharting grade snapshot per card_id for a given category.
 *
 * We intentionally avoid ANY($2) / array literals to dodge malformed array errors.
 * Instead, we just do one simple query per card_id. For per-card price pages,
 * this is perfectly fine.
 */
export async function getLatestPricechartingSnapshotsForCards(args: {
  category: PricechartingCategory;
  cardIds: string[];
}): Promise<Record<string, PricechartingGradeSnapshot>> {
  const { category, cardIds } = args;

  const out: Record<string, PricechartingGradeSnapshot> = {};
  if (!cardIds.length) return out;

  for (const cardId of cardIds) {
    if (!cardId) continue;

    const rows =
      (
        await db.execute<PricechartingGradeSnapshot>(sql`
          SELECT
            category,
            card_id,
            pricecharting_id,
            currency,
            loose_cents,
            graded_cents,
            cib_cents,
            new_cents,
            box_only_cents,
            manual_only_cents,
            bgs10_cents,
            cgc10_cents,
            sgc10_cents,
            captured_at::text AS captured_at
          FROM pricecharting_grade_snapshots
          WHERE category = ${category}
            AND card_id = ${cardId}
          ORDER BY captured_at DESC
          LIMIT 1
        `)
      ).rows ?? [];

    const snap = rows[0];
    if (snap) {
      out[cardId] = snap;
    }
  }

  return out;
}

/* =============================
   TOP CARDS BY PRICECHARTING
   ============================= */

/**
 * Get top cards for a category from the CSV snapshot table, ordered by graded_price_cents DESC.
 */
export async function getTopPricechartingCardPrices(args: {
  category: PricechartingCategory;
  limit?: number;
  orderBy?: "graded_price_cents"; // reserved for future expansion
}): Promise<PricechartingCardRow[]> {
  const { category } = args;
  const limit = args.limit ?? 20;

  const rows =
    (
      await db.execute<PricechartingCardRow>(sql`
        SELECT
          category,
          pricecharting_id,
          product_name,
          console_name,
          release_date,
          loose_price_cents,
          cib_price_cents,
          new_price_cents,
          graded_price_cents,
          box_only_price_cents,
          manual_only_price_cents,
          bgs_10_price_cents,
          condition_17_price_cents,
          condition_18_price_cents
        FROM pricecharting_card_prices
        WHERE category = ${category}
          AND graded_price_cents IS NOT NULL
        ORDER BY graded_price_cents DESC
        LIMIT ${limit}
      `)
    ).rows ?? [];

  return rows;
}
