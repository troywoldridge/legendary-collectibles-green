 
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

// --- simple arg parsing ---
const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [k, v] = arg.split("=");
    return [k.replace(/^--/, ""), v ?? "true"];
  }),
);

const CATEGORY = args.get("category") || "pokemon"; // pokemon | mtg | yugioh later
const LIMIT = Number(args.get("limit") || "500");
const OFFSET = Number(args.get("offset") || "0");
const SLEEP_MS = Number(args.get("sleepMs") || "300"); // ms between calls

console.log(
  `[PriceChartingCron] category=${CATEGORY} limit=${LIMIT} offset=${OFFSET} sleep=${SLEEP_MS}ms`,
);

// --- helpers ---
function pennies(val) {
  if (val == null) return null;
  if (typeof val !== "number") return null;
  if (!Number.isFinite(val)) return null;
  if (val <= 0) return null;
  return Math.round(val);
}

/**
 * Fetch a single product from PriceCharting by text query.
 */
async function fetchProductByQuery(q) {
  const url =
    `${BASE_URL}/product` +
    `?t=${encodeURIComponent(TOKEN)}` +
    `&q=${encodeURIComponent(q)}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    console.warn(
      "[PriceChartingCron] HTTP error",
      res.status,
      res.statusText,
      "for query",
      q,
    );
    return null;
  }
  const data = await res.json();
  if (data.status !== "success") {
    console.warn(
      "[PriceChartingCron] API error for query",
      q,
      data["error-message"],
    );
    return null;
  }
  return data;
}

async function main() {
  const client = await pool.connect();
  try {
    // For now we only support Pokémon: tcg_cards
    if (CATEGORY !== "pokemon") {
      console.error(
        "This script currently only supports category=pokemon (tcg_cards table).",
      );
      process.exit(1);
    }

    const { rows: cards } = await client.query(
      `
      SELECT id, name
      FROM tcg_cards
      ORDER BY id
      LIMIT $1 OFFSET $2
    `,
      [LIMIT, OFFSET],
    );

    console.log(
      `[PriceChartingCron] fetched ${cards.length} cards from tcg_cards`,
    );

    let processed = 0;
    for (const card of cards) {
      const name = card.name || card.id;
      const query = `${name} Pokemon Card`; // same style we used on the price page

      try {
        const product = await fetchProductByQuery(query);
        if (!product) {
          console.log(
            `[PriceChartingCron] no match for card=${card.id}, name="${name}"`,
          );
          await sleep(SLEEP_MS);
          continue;
        }

        const snap = {
          category: CATEGORY,
          card_id: card.id,
          pricecharting_id: product.id ? Number(product.id) : null,
          currency: "USD",
          loose_cents: pennies(product["loose-price"]),
          graded_cents: pennies(product["graded-price"]),
          cib_cents: pennies(product["cib-price"]),
          new_cents: pennies(product["new-price"]),
          box_only_cents: pennies(product["box-only-price"]),
          manual_only_cents: pennies(product["manual-only-price"]),
          bgs10_cents: pennies(product["bgs-10-price"]),
          cgc10_cents: pennies(product["condition-17-price"]),
          sgc10_cents: pennies(product["condition-18-price"]),
          raw_json: product,
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

        processed += 1;
        if (processed % 50 === 0) {
          console.log(
            `[PriceChartingCron] processed ${processed}/${cards.length} (last card=${card.id})`,
          );
        }
      } catch (err) {
        console.error(
          `[PriceChartingCron] error on card=${card.id} "${name}":`,
          err,
        );
      }

      if (SLEEP_MS > 0) await sleep(SLEEP_MS);
    }

    console.log(
      `[PriceChartingCron] done. processed=${processed}, total=${cards.length}`,
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[PriceChartingCron] fatal error", err);
  process.exit(1);
});
