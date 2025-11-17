/* eslint-disable no-console */
// Node 18+ / 20+
// Install deps first:
//   pnpm add pg csv-parse
//
// Env needed:
//   DATABASE_URL=postgres://user:pass@host:5432/db
//   PRICECHARTING_API_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

import "dotenv/config";
import { Pool } from "pg";
import { parse } from "csv-parse/sync";
import { promises as fs } from "node:fs";
import path from "node:path";

const { DATABASE_URL, PRICECHARTING_API_TOKEN } = process.env;

if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL env");
  process.exit(1);
}
if (!PRICECHARTING_API_TOKEN) {
  console.error("Missing PRICECHARTING_API_TOKEN env");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 4 });

// Map your three games to PriceCharting CSV slugs
const CATEGORIES = [
  { slug: "pokemon-cards", category: "pokemon" },
  { slug: "magic-cards", category: "mtg" },
  { slug: "yugioh-cards", category: "yugioh" },
];

// Where to save a copy of the CSVs
const EXPORT_DIR = path.resolve("exports", "pricecharting");

/* ---------------------------------------
 * Helpers
 * ------------------------------------- */

/**
 * Convert a CSV value into integer cents, or null.
 *
 * Handles:
 *   "26403"   -> 26403  (assume cents)
 *   "264.03"  -> 26403  (assume dollars, *100)
 *   "$264.03" -> 26403
 *   "26,403"  -> 26403
 */
function intOrNull(v) {
  if (v == null) return null;

  let s = String(v).trim();
  if (!s) return null;

  // Strip $ and commas and spaces
  s = s.replace(/[\$,]/g, "").trim();
  if (!s) return null;

  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;

  // If there's a decimal point, treat value as dollars, convert to cents
  if (s.includes(".")) {
    return Math.round(n * 100);
  }

  // Otherwise assume already cents
  return Math.round(n);
}

// Fetch raw CSV text for a given slug
async function fetchCsv(slug) {
  const url =
    `https://www.pricecharting.com/price-guide/download-custom` +
    `?t=${PRICECHARTING_API_TOKEN}` +
    `&category=${encodeURIComponent(slug)}`;

  console.log(`[PriceChartingCSV] Fetching CSV: ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `HTTP ${res.status} ${res.statusText} for slug=${slug}\n` +
        body.slice(0, 500),
    );
  }
  const text = await res.text();
  return text;
}

// Parse CSV into JS objects (one per row)
function parseCsv(text) {
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
  });
  return records;
}

// Save a copy of the raw CSV so you can inspect it
async function saveCsvToFile(category, text) {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  await fs.mkdir(EXPORT_DIR, { recursive: true });

  const filePath = path.join(
    EXPORT_DIR,
    `pricecharting-${category}-${date}.csv`,
  );

  await fs.writeFile(filePath, text, "utf8");
  console.log(`[PriceChartingCSV] Saved raw CSV for ${category} to: ${filePath}`);
  return filePath;
}

// Import a single category from CSV -> pricecharting_card_prices
async function importCategory(client, { slug, category }) {
  console.log(
    `\n=== SAFE CSV sync for ${category.toUpperCase()} (${slug}) ===`,
  );

  const csvText = await fetchCsv(slug);

  // Export raw CSV so you can inspect it
  await saveCsvToFile(category, csvText);

  const rows = parseCsv(csvText);
  console.log(
    `[PriceChartingCSV] Parsed ${rows.length} rows from CSV for ${category}`,
  );

  const chunkSize = 1000;
  let totalProcessed = 0;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);

    const values = [];
    const params = [];
    let p = 1;

    for (const row of chunk) {
      const pcId = row["id"] ?? null;
      const productName = row["product-name"] ?? null;

      if (!pcId || !productName) continue;

      const consoleName = row["console-name"] || null;
      const releaseDate = row["release-date"] || null; // YYYY-MM-DD

      const loose = intOrNull(row["loose-price"]);
      const cib = intOrNull(row["cib-price"]);
      const neu = intOrNull(row["new-price"]);
      const graded = intOrNull(row["graded-price"]);
      const boxOnly = intOrNull(row["box-only-price"]);
      const manualOnly = intOrNull(row["manual-only-price"]);
      const bgs10 = intOrNull(row["bgs-10-price"]);
      const cond17 = intOrNull(row["condition-17-price"]); // CGC 10
      const cond18 = intOrNull(row["condition-18-price"]); // SGC 10

      values.push(
        `($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, ` +
          `$${p++}, $${p++}, $${p++}, $${p++}, $${p++}, ` +
          `$${p++}, $${p++}, $${p++}, $${p++})`,
      );

      params.push(
        category, // 1
        String(pcId), // 2 pricecharting_id
        productName, // 3
        consoleName, // 4
        releaseDate, // 5
        loose, // 6
        cib, // 7
        neu, // 8
        graded, // 9
        boxOnly, // 10
        manualOnly, // 11
        bgs10, // 12
        cond17, // 13
        cond18, // 14
      );
    }

    if (!values.length) continue;

    const sql = `
      INSERT INTO pricecharting_card_prices (
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
      )
      VALUES
        ${values.join(",")}
      ON CONFLICT (category, pricecharting_id)
      DO UPDATE SET
        product_name = EXCLUDED.product_name,
        console_name = EXCLUDED.console_name,
        release_date = EXCLUDED.release_date,
        loose_price_cents = COALESCE(EXCLUDED.loose_price_cents, pricecharting_card_prices.loose_price_cents),
        cib_price_cents = COALESCE(EXCLUDED.cib_price_cents, pricecharting_card_prices.cib_price_cents),
        new_price_cents = COALESCE(EXCLUDED.new_price_cents, pricecharting_card_prices.new_price_cents),
        graded_price_cents = COALESCE(EXCLUDED.graded_price_cents, pricecharting_card_prices.graded_price_cents),
        box_only_price_cents = COALESCE(EXCLUDED.box_only_price_cents, pricecharting_card_prices.box_only_price_cents),
        manual_only_price_cents = COALESCE(EXCLUDED.manual_only_price_cents, pricecharting_card_prices.manual_only_price_cents),
        bgs_10_price_cents = COALESCE(EXCLUDED.bgs_10_price_cents, pricecharting_card_prices.bgs_10_price_cents),
        condition_17_price_cents = COALESCE(EXCLUDED.condition_17_price_cents, pricecharting_card_prices.condition_17_price_cents),
        condition_18_price_cents = COALESCE(EXCLUDED.condition_18_price_cents, pricecharting_card_prices.condition_18_price_cents),
        updated_at = now();
    `;

    await client.query(sql, params);
    totalProcessed += chunk.length;

    console.log(
      `[PriceChartingCSV] Upserted ${totalProcessed}/${rows.length} rows for ${category}`,
    );
  }

  console.log(
    `[PriceChartingCSV] Done ${category}: processed=${totalProcessed} CSV rows`,
  );
}

async function main() {
  const client = await pool.connect();
  try {
    const args = new Map(
      process.argv.slice(2).map((arg) => {
        const [k, v] = arg.split("=");
        return [k.replace(/^--/, ""), v ?? "true"];
      }),
    );
    const only = (args.get("category") || "all").toLowerCase(); // pokemon|mtg|yugioh|all

    console.log(
      `[PriceChartingCSV] SAFE import; category=${only}`,
    );

    for (const cfg of CATEGORIES) {
      if (only !== "all" && only !== cfg.category) continue;
      await importCategory(client, cfg);
    }
  } catch (err) {
    console.error("[PriceChartingCSV] Sync failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
