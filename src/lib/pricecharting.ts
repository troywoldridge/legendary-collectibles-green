// src/lib/pricecharting.ts
import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

const PRICECHARTING_ENABLED = process.env.ENABLE_PRICECHARTING === "true";


/* =============================
   TYPES
   ============================= */

export type PricechartingCategory = "pokemon" | "mtg" | "yugioh";

export type PricechartingCardPriceRow = {
  category: PricechartingCategory;
  pricecharting_id: string;
  product_name: string;
  console_name: string | null;
  release_date: string | null; // DATE -> text

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

export type PricechartingGradeSnapshotRow = {
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

  captured_at: string; // timestamptz -> ISO string
};

/* =============================
   HELPERS
   ============================= */

export function centsToUsd(
  cents: number | null | undefined,
): string | null {
  if (cents == null || !Number.isFinite(cents) || cents <= 0) return null;
  const dollars = cents / 100;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function snapshotHasAnyPrice(s: PricechartingGradeSnapshotRow | undefined) {
  if (!s) return false;
  return (
    s.loose_cents != null ||
    s.graded_cents != null ||
    s.cib_cents != null ||
    s.new_cents != null ||
    s.box_only_cents != null ||
    s.manual_only_cents != null ||
    s.bgs10_cents != null ||
    s.cgc10_cents != null ||
    s.sgc10_cents != null
  );
}

/* =============================
   TOP CARDS (CSV SNAPSHOT)
   ============================= */

export async function getTopPricechartingCardPrices(opts: {
  category: PricechartingCategory;
  limit?: number;
  orderBy?:
    | "graded_price_cents"
    | "loose_price_cents"
    | "new_price_cents";
}) {
  const { category, limit = 100, orderBy = "graded_price_cents" } = opts;

  const { rows } = await db.execute<PricechartingCardPriceRow>(
    sql`
      SELECT
        category,
        pricecharting_id,
        product_name,
        console_name,
        release_date::text AS release_date,
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
      ORDER BY
        ${sql.raw(orderBy)} DESC NULLS LAST,
        loose_price_cents DESC NULLS LAST
      LIMIT ${limit}
    `,
  );

  return rows;
}

/* =============================
   LATEST SNAPSHOTS PER CARD
   ============================= */

/**
 * For a set of card IDs, return a map:
 *   { [card_id]: PricechartingGradeSnapshotRow }
 *
 * Priority:
 *   1) Latest snapshot that actually has any price columns filled
 *   2) If none, but we have pricecharting_id, fall back to CSV table
 *      (`pricecharting_card_prices`) to fill prices.
 */
export async function getLatestPricechartingSnapshotsForCards(opts: {
  category: PricechartingCategory;
  cardIds: string[];
}) {
  const { category, cardIds } = opts;
  const out: Record<string, PricechartingGradeSnapshotRow> = {};

  if (!cardIds.length) return out;

  for (const cardId of cardIds) {
    if (!cardId) continue;

    if (!PRICECHARTING_ENABLED) return null;


    // 1) Grab the "best" snapshot for this card:
    //    - prefer rows with any price field filled
    //    - then newest captured_at
    const { rows } =
      await db.execute<PricechartingGradeSnapshotRow>(sql`
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
        ORDER BY
          (
            loose_cents IS NOT NULL OR
            graded_cents IS NOT NULL OR
            cib_cents IS NOT NULL OR
            new_cents IS NOT NULL OR
            box_only_cents IS NOT NULL OR
            manual_only_cents IS NOT NULL OR
            bgs10_cents IS NOT NULL OR
            cgc10_cents IS NOT NULL OR
            sgc10_cents IS NOT NULL
          ) DESC,
          captured_at DESC
        LIMIT 1
      `);

    const snap = rows[0];
    if (!snap) continue;

    // 2) If this snapshot already has prices, just use it
    if (snapshotHasAnyPrice(snap)) {
      out[cardId] = snap;
      continue;
    }

    // 3) Otherwise, try to fill from the CSV snapshot table, if we know the PC id
    if (snap.pricecharting_id != null) {
      const { rows: pcRows } =
        await db.execute<PricechartingCardPriceRow>(sql`
          SELECT
            category,
            pricecharting_id,
            product_name,
            console_name,
            release_date::text AS release_date,
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
            AND pricecharting_id = ${String(snap.pricecharting_id)}
          LIMIT 1
        `);

      const pc = pcRows[0];

      if (pc) {
        out[cardId] = {
          category: snap.category,
          card_id: snap.card_id,
          pricecharting_id: snap.pricecharting_id,
          currency: snap.currency || "USD",
          loose_cents: pc.loose_price_cents,
          graded_cents: pc.graded_price_cents,
          cib_cents: pc.cib_price_cents,
          new_cents: pc.new_price_cents,
          box_only_cents: pc.box_only_price_cents,
          manual_only_cents: pc.manual_only_price_cents,
          bgs10_cents: pc.bgs_10_price_cents,
          cgc10_cents: pc.condition_17_price_cents,
          sgc10_cents: pc.condition_18_price_cents,
          captured_at: snap.captured_at,
        };
        continue;
      }
    }

    // 4) No prices anywhere; still return the bare snapshot so the date shows
    out[cardId] = snap;
  }

  return out;
}
