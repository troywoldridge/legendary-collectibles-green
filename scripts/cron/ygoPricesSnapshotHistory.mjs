// scripts/cron/ygoPricesSnapshotHistory.mjs
// Snapshot current YGO prices into ygo_card_prices_history once per run.
//
// Usage:
//   DATABASE_URL=postgres://... node scripts/cron/ygoPricesSnapshotHistory.mjs
//
// Recommended: run nightly via cron / systemd AFTER your YGO price updater.

import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL env var");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 4,
});

async function snapshotYgoPrices() {
  const client = await pool.connect();
  try {
    console.log(
      `[ygoPricesSnapshotHistory] Starting snapshot at ${new Date().toISOString()}`,
    );

    const sql = `
      INSERT INTO ygo_card_prices_history (
        card_id,
        captured_at,
        source_updated_at,
        tcgplayer_price,
        cardmarket_price,
        ebay_price,
        amazon_price,
        coolstuffinc_price
      )
      SELECT
        p.card_id,
        now() AS captured_at,
        p.updated_at AS source_updated_at,
        NULLIF(p.tcgplayer_price, '')::numeric(12,2),
        NULLIF(p.cardmarket_price, '')::numeric(12,2),
        NULLIF(p.ebay_price, '')::numeric(12,2),
        NULLIF(p.amazon_price, '')::numeric(12,2),
        NULLIF(p.coolstuffinc_price, '')::numeric(12,2)
      FROM ygo_card_prices p
      WHERE NOT EXISTS (
        SELECT 1
        FROM ygo_card_prices_history h
        WHERE h.card_id = p.card_id
          AND h.captured_at::date = CURRENT_DATE
      );
    `;

    const res = await client.query(sql);
    console.log(
      `[ygoPricesSnapshotHistory] Inserted ${res.rowCount} history rows`,
    );
  } catch (err) {
    console.error("[ygoPricesSnapshotHistory] ERROR:", err);
    process.exitCode = 1;
  } finally {
    client.release();
  }
}

snapshotYgoPrices()
  .catch((err) => {
    console.error("[ygoPricesSnapshotHistory] Fatal:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    pool.end();
  });
