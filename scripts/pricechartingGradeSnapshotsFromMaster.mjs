/* eslint-disable no-console */
// Node 20+
// pnpm add pg
import "dotenv/config";
import { Pool } from "pg";
import { setTimeout as sleep } from "node:timers/promises";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL env");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 4 });

/**
 * Simple CLI args parser: --only=pokemon|mtg|yugioh|all
 */
const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [k, v] = arg.split("=");
    return [k.replace(/^--/, ""), v ?? "true"];
  }),
);

const ONLY = (args.get("only") || "all").toLowerCase(); // pokemon | mtg | yugioh | all
const SLEEP_MS = Number(args.get("sleepMs") || "0");

/**
 * Config per category
 */
const CATEGORY_CONFIG = [
  {
    category: "pokemon",
    cardTable: "tcg_cards",
    idColumn: "id",
    nameColumn: "name",
  },
  {
    category: "mtg",
    cardTable: "mtg_cards",
    idColumn: "id",
    nameColumn: "name",
  },
  {
    category: "yugioh",
    cardTable: "ygo_cards",
    idColumn: "card_id",
    nameColumn: "name",
  },
];

/**
 * Build a LIKE pattern for name matching.
 * For now we're simple: "%<name>%"
 */
function buildNamePattern(name) {
  if (!name) return null;
  return `%${name.trim().replace(/\s+/g, " ")}%`;
}

/**
 * Process one category: pokemon | mtg | yugioh
 */
async function processCategory(client, cfg) {
  const { category, cardTable, idColumn, nameColumn } = cfg;

  console.log(
    `\n=== Rebuilding PriceCharting grade snapshots for ${category.toUpperCase()} ===`,
  );
  console.log(
    `[PriceChartingSnap] Cards table=${cardTable}, idColumn=${idColumn}, nameColumn=${nameColumn}`,
  );

  // 1) Delete existing snapshots for this category
  console.log(`[PriceChartingSnap] Deleting existing snapshots for ${category}...`);
  await client.query(
    `DELETE FROM pricecharting_grade_snapshots WHERE category = $1`,
    [category],
  );

  // 2) Load all cards for this category
  const { rows: cards } = await client.query(
    `
      SELECT ${idColumn} AS card_id, ${nameColumn} AS name
      FROM ${cardTable}
      ORDER BY ${idColumn} ASC
    `,
  );

  console.log(
    `[PriceChartingSnap] Loaded ${cards.length} cards from ${cardTable} for ${category}`,
  );

  let processed = 0;
  let matched = 0;
  let skippedNoName = 0;
  let skippedNoMatch = 0;

  for (const card of cards) {
    const cardId = card.card_id;
    const name = card.name;

    if (!name) {
      skippedNoName++;
      continue;
    }

    const pattern = buildNamePattern(name);
    if (!pattern) {
      skippedNoName++;
      continue;
    }

    try {
      // 3) Find best match in pricecharting_card_prices
      const { rows: pcRows } = await client.query(
        `
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
          WHERE category = $1
            AND product_name ILIKE $2
          ORDER BY
            graded_price_cents DESC NULLS LAST,
            loose_price_cents  DESC NULLS LAST
          LIMIT 1
        `,
        [category, pattern],
      );

      const row = pcRows[0];
      if (!row) {
        skippedNoMatch++;
        processed++;
        if (processed % 500 === 0) {
          console.log(
            `[PriceChartingSnap] ${category}: processed=${processed}, matched=${matched}, noName=${skippedNoName}, noMatch=${skippedNoMatch}`,
          );
        }
        if (SLEEP_MS > 0) await sleep(SLEEP_MS);
        continue;
      }

      // 4) Insert snapshot into pricecharting_grade_snapshots
      const snap = {
        category,
        card_id: cardId,
        pricecharting_id: row.pricecharting_id
          ? Number(row.pricecharting_id)
          : null,
        currency: "USD",
        loose_cents: row.loose_price_cents,
        graded_cents: row.graded_price_cents,
        cib_cents: row.cib_price_cents,
        new_cents: row.new_price_cents,
        box_only_cents: row.box_only_price_cents,
        manual_only_cents: row.manual_only_price_cents,
        bgs10_cents: row.bgs_10_price_cents,
        cgc10_cents: row.condition_17_price_cents,
        sgc10_cents: row.condition_18_price_cents,
        raw_json: {
          source: "pricecharting_csv",
          product_name: row.product_name,
          console_name: row.console_name,
          release_date: row.release_date,
          pricecharting_id: row.pricecharting_id,
        },
      };

      await client.query(
        `
          INSERT INTO pricecharting_grade_snapshots (
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
            raw_json
          )
          VALUES (
            $1,$2,$3,$4,
            $5,$6,$7,$8,$9,$10,$11,$12,$13,$14
          )
        `,
        [
          snap.category,
          snap.card_id,
          snap.pricecharting_id,
          snap.currency,
          snap.loose_cents,
          snap.graded_cents,
          snap.cib_cents,
          snap.new_cents,
          snap.box_only_cents,
          snap.manual_only_cents,
          snap.bgs10_cents,
          snap.cgc10_cents,
          snap.sgc10_cents,
          snap.raw_json,
        ],
      );

      matched++;
      processed++;
      if (processed % 500 === 0) {
        console.log(
          `[PriceChartingSnap] ${category}: processed=${processed}, matched=${matched}, noName=${skippedNoName}, noMatch=${skippedNoMatch}`,
        );
      }
    } catch (err) {
      console.error(
        `[PriceChartingSnap] Error on card_id=${cardId} "${name}":`,
        err,
      );
      processed++;
    }

    if (SLEEP_MS > 0) await sleep(SLEEP_MS);
  }

  console.log(
    `[PriceChartingSnap] DONE ${category}: processed=${processed}, matched=${matched}, noName=${skippedNoName}, noMatch=${skippedNoMatch}`,
  );
}

/**
 * Main entry
 */
async function main() {
  console.log(
    `[PriceChartingSnap] Starting from master; only=${ONLY}, sleepMs=${SLEEP_MS}`,
  );
  const client = await pool.connect();
  try {
    for (const cfg of CATEGORY_CONFIG) {
      if (ONLY !== "all" && ONLY !== cfg.category) continue;
      await processCategory(client, cfg);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[PriceChartingSnap] Fatal error:", err);
  process.exit(1);
});
