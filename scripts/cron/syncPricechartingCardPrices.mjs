 
// Node 18+ (Node 20 is perfect)
// Install deps:
//   pnpm add pg csv-parse
//
// Env needed:
//   DATABASE_URL=postgres://user:pass@host:5432/dbname
//   PRICECHARTING_API_TOKEN=27ce8f6b1334e76d0b11822be951233b49e82617

import "dotenv/config";
import { Pool } from "pg";
import { parse } from "csv-parse/sync";

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

const CATEGORIES = [
  { slug: "pokemon-cards", category: "pokemon" },
  { slug: "magic-cards", category: "mtg" },
  { slug: "yugioh-cards", category: "yugioh" },
];

function intOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  // CSV columns are pennies, we keep them as-is (cents)
  return Math.round(n);
}

async function fetchCsv(slug) {
  const url = `https://www.pricecharting.com/price-guide/download-custom?t=${PRICECHARTING_API_TOKEN}&category=${slug}`;
  console.log(`Fetching CSV: ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(
      `HTTP ${res.status} ${res.statusText} for ${url}\nBody: ${txt.slice(
        0,
        500,
      )}`,
    );
  }
  const text = await res.text();
  return text;
}

function parseCsv(text) {
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
  });
  return records;
}

async function importCategory(client, { slug, category }) {
  console.log(`\n=== Importing PriceCharting for ${category.toUpperCase()} (${slug}) ===`);

  const csvText = await fetchCsv(slug);
  const records = parseCsv(csvText);
  console.log(`Parsed ${records.length} rows from CSV for ${category}`);

  // Wipe previous snapshot for this category
  await client.query(
    "DELETE FROM pricecharting_card_prices WHERE category = $1",
    [category],
  );

  const chunkSize = 500;
  let inserted = 0;

  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);

    const values = [];
    const params = [];
    let p = 1;

    for (const row of chunk) {
      const pcId = row["id"] ?? null;
      const name = row["product-name"] ?? null;
      if (!pcId || !name) continue;

      const consoleName = row["console-name"] ?? null;
      const releaseDate = row["release-date"] || null;

      const loose = intOrNull(row["loose-price"]);
      const cib = intOrNull(row["cib-price"]);
      const newPrice = intOrNull(row["new-price"]);
      const graded = intOrNull(row["graded-price"]);
      const boxOnly = intOrNull(row["box-only-price"]);
      const manualOnly = intOrNull(row["manual-only-price"]);
      const bgs10 = intOrNull(row["bgs-10-price"]);
      const cond17 = intOrNull(row["condition-17-price"]);
      const cond18 = intOrNull(row["condition-18-price"]);

      values.push(
        `($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, ` +
          `$${p++}, $${p++}, $${p++}, $${p++}, $${p++}, ` +
          `$${p++}, $${p++}, $${p++}, $${p++})`,
      );

      params.push(
        category,
        String(pcId),
        name,
        consoleName,
        releaseDate,
        loose,
        cib,
        newPrice,
        graded,
        boxOnly,
        manualOnly,
        bgs10,
        cond17,
        cond18,
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
        loose_price_cents = EXCLUDED.loose_price_cents,
        cib_price_cents = EXCLUDED.cib_price_cents,
        new_price_cents = EXCLUDED.new_price_cents,
        graded_price_cents = EXCLUDED.graded_price_cents,
        box_only_price_cents = EXCLUDED.box_only_price_cents,
        manual_only_price_cents = EXCLUDED.manual_only_price_cents,
        bgs_10_price_cents = EXCLUDED.bgs_10_price_cents,
        condition_17_price_cents = EXCLUDED.condition_17_price_cents,
        condition_18_price_cents = EXCLUDED.condition_18_price_cents,
        updated_at = now();
    `;

    await client.query(sql, params);
    inserted += chunk.length;
    console.log(
      `  Upserted ${inserted}/${records.length} rows for ${category}`,
    );
  }

  console.log(`Done ${category}: ${inserted} rows processed.`);
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const cfg of CATEGORIES) {
      await importCategory(client, cfg);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Sync failed:", err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
