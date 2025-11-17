/* eslint-disable no-console */
// Node 20+
// pnpm add pg
import "dotenv/config";
import { Pool } from "pg";
import { setTimeout as sleep } from "node:timers/promises";

const DATABASE_URL = process.env.DATABASE_URL;
const TOKEN = process.env.PRICECHARTING_API_TOKEN;

if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL env");
  process.exit(1);
}
if (!TOKEN) {
  console.error("Missing PRICECHARTING_API_TOKEN env");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 4 });
const BASE_URL = "https://www.pricecharting.com/api";

// --- cli args ----------------------------------------------------
const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [k, v] = arg.split("=");
    return [k.replace(/^--/, ""), v ?? "true"];
  }),
);

const CATEGORY = (args.get("category") || "all").toLowerCase(); // pokemon|mtg|yugioh|all
const LIMIT = Number(args.get("limit") || "0"); // 0 = no explicit limit
const SLEEP_MS = Number(args.get("sleepMs") || "300"); // delay between API calls

console.log(
  `[PriceChartingBackfill] category=${CATEGORY} limit=${LIMIT} sleepMs=${SLEEP_MS}`,
);

// --- helpers -----------------------------------------------------
function pennies(val) {
  if (val == null) return null;
  if (typeof val !== "number") return null;
  if (!Number.isFinite(val)) return null;
  if (val <= 0) return null;
  // PriceCharting already gives pennies, but we keep this in case they change
  return Math.round(val);
}

async function fetchProductById(id) {
  const url =
    `${BASE_URL}/product` +
    `?t=${encodeURIComponent(TOKEN)}` +
    `&id=${encodeURIComponent(id)}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    console.warn(
      "[PriceChartingBackfill] HTTP error",
      res.status,
      res.statusText,
      "for id",
      id,
    );
    return null;
  }

  const data = await res.json();
  if (data.status !== "success") {
    console.warn(
      "[PriceChartingBackfill] API error for id",
      id,
      data["error-message"],
    );
    return null;
  }
  return data;
}

// Determine which categories to process
const CAT_LIST = ["pokemon", "mtg", "yugioh"];

// --- main per-category worker ------------------------------------
async function backfillCategory(client, category) {
  console.log(`\n=== Backfilling PriceCharting prices for ${category.toUpperCase()} ===`);

  // rows where ALL price fields are null
  const whereClause = `
    category = $1
    AND loose_price_cents IS NULL
    AND cib_price_cents IS NULL
    AND new_price_cents IS NULL
    AND graded_price_cents IS NULL
    AND box_only_price_cents IS NULL
    AND manual_only_price_cents IS NULL
    AND bgs_10_price_cents IS NULL
    AND condition_17_price_cents IS NULL
    AND condition_18_price_cents IS NULL
  `;

  // get total count so you know what you're in for
  const { rows: countRows } = await client.query(
    `SELECT COUNT(*)::int AS total FROM pricecharting_card_prices WHERE ${whereClause}`,
    [category],
  );
  const total = countRows[0]?.total ?? 0;
  console.log(
    `[PriceChartingBackfill] ${category}: rows with ALL prices NULL = ${total}`,
  );
  if (total === 0) {
    console.log(`[PriceChartingBackfill] ${category}: nothing to backfill.`);
    return;
  }

  // now fetch them in chunks; we keep it simple: one big SELECT and loop in memory
  const { rows } = await client.query(
    `
      SELECT category, pricecharting_id
      FROM pricecharting_card_prices
      WHERE ${whereClause}
      ORDER BY pricecharting_id
    `,
    [category],
  );

  let processed = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    if (LIMIT > 0 && processed >= LIMIT) break;

    const id = row.pricecharting_id;
    if (!id) {
      skipped++;
      processed++;
      continue;
    }

    try {
      const product = await fetchProductById(id);
      if (!product) {
        skipped++;
        processed++;
        if (SLEEP_MS > 0) await sleep(SLEEP_MS);
        continue;
      }

      const loose = pennies(product["loose-price"]);
      const cib = pennies(product["cib-price"]);
      const neu = pennies(product["new-price"]);
      const graded = pennies(product["graded-price"]);
      const boxOnly = pennies(product["box-only-price"]);
      const manualOnly = pennies(product["manual-only-price"]);
      const bgs10 = pennies(product["bgs-10-price"]);
      const cgc10 = pennies["condition-17-price"]
        ? pennies(product["condition-17-price"])
        : pennies(product["condition-17-price"]);
      const sgc10 = pennies(product["condition-18-price"]);

      // if everything is still null, no point updating
      if (
        loose == null &&
        cib == null &&
        neu == null &&
        graded == null &&
        boxOnly == null &&
        manualOnly == null &&
        bgs10 == null &&
        cgc10 == null &&
        sgc10 == null
      ) {
        skipped++;
        processed++;
        if (SLEEP_MS > 0) await sleep(SLEEP_MS);
        continue;
      }

      await client.query(
        `
          UPDATE pricecharting_card_prices
          SET
            loose_price_cents        = $3,
            cib_price_cents          = $4,
            new_price_cents          = $5,
            graded_price_cents       = $6,
            box_only_price_cents     = $7,
            manual_only_price_cents  = $8,
            bgs_10_price_cents       = $9,
            condition_17_price_cents = $10,
            condition_18_price_cents = $11,
            updated_at               = NOW()
          WHERE category = $1
            AND pricecharting_id = $2
        `,
        [
          category,
          id,
          loose,
          cib,
          neu,
          graded,
          boxOnly,
          manualOnly,
          bgs10,
          cgc10,
          sgc10,
        ],
      );

      updated++;
      processed++;

      if (processed % 100 === 0) {
        console.log(
          `[PriceChartingBackfill] ${category}: processed=${processed}/${total}, updated=${updated}, skipped=${skipped}`,
        );
      }
    } catch (err) {
      console.error(
        `[PriceChartingBackfill] Error updating category=${category}, id=${id}:`,
        err,
      );
      skipped++;
      processed++;
    }

    if (SLEEP_MS > 0) await sleep(SLEEP_MS);
  }

  console.log(
    `[PriceChartingBackfill] DONE ${category}: total=${total}, updated=${updated}, skipped=${skipped}`,
  );
}

// --- main --------------------------------------------------------
async function main() {
  const client = await pool.connect();
  try {
    for (const cat of CAT_LIST) {
      if (CATEGORY !== "all" && CATEGORY !== cat) continue;
      await backfillCategory(client, cat);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[PriceChartingBackfill] Fatal:", err);
  process.exit(1);
});
