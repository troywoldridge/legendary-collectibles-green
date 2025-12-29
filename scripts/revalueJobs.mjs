#!/usr/bin/env node
// scripts/revalueJobs.mjs
import "dotenv/config";
import pg from "pg";

const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[revalueJobs] Missing DATABASE_URL in env");
  process.exit(1);
}

// Change this if your game id differs ("magic" instead of "mtg")
const GAME = process.env.REVALUE_GAME || "mtg";

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Revalue one user's items using scryfall_cards_raw.payload->prices.
 * Assumes:
 *   user_collection_items.card_id == scryfall_cards_raw.id (uuid text)
 * If your card_id is oracle_id instead, change the JOIN as noted below.
 */
async function revalueUserInDb(client, userId) {
  const asOfDate = todayISODate();

  // 1) Update last_value_cents for this user's MTG items
  // Price priority: usd -> usd_foil -> usd_etched
  // Convert to cents (rounded). If no price, keep existing last_value_cents unchanged.
  const updateSql = `
    WITH priced AS (
      SELECT
        i.id AS item_id,
        i.user_id,
        i.game,
        i.card_id,
        i.quantity,
        COALESCE(
          NULLIF(scr.payload->'prices'->>'usd', ''),
          NULLIF(scr.payload->'prices'->>'usd_foil', ''),
          NULLIF(scr.payload->'prices'->>'usd_etched', '')
        ) AS usd_str
      FROM user_collection_items i
      JOIN scryfall_cards_raw scr
        ON scr.id::text = i.card_id
        -- If your collection stores oracle_id instead, use:
        -- ON scr.oracle_id::text = i.card_id
      WHERE i.user_id = $1
        AND i.game = $2
    ),
    normalized AS (
      SELECT
        item_id,
        quantity,
        CASE
          WHEN usd_str ~ '^[0-9]+(\\.[0-9]+)?$' THEN ROUND((usd_str::numeric) * 100)::int
          ELSE NULL
        END AS unit_price_cents
      FROM priced
    ),
    updated AS (
      UPDATE user_collection_items i
      SET
        last_value_cents = CASE
          WHEN n.unit_price_cents IS NULL THEN i.last_value_cents
          ELSE (n.unit_price_cents * i.quantity)
        END,
        updated_at = NOW()
      FROM normalized n
      WHERE i.id = n.item_id
      RETURNING i.id
    )
    SELECT COUNT(*)::int AS updated_count
    FROM updated;
  `;

  const updatedCount =
    (await client.query(updateSql, [userId, GAME])).rows?.[0]?.updated_count ?? 0;

  // 2) Snapshot today's valuation (based on last_value_cents)
  // Requires unique constraint: ux_uc_item_vals_user_item_date_source
  // Source is set to 'scryfall_bulk' so it stays consistent.
  const snapSql = `
    INSERT INTO user_collection_item_valuations (
      user_id,
      item_id,
      as_of_date,
      game,
      value_cents,
      currency,
      source,
      confidence,
      meta,
      created_at,
      updated_at
    )
    SELECT
      i.user_id,
      i.id AS item_id,
      $2::date AS as_of_date,
      i.game,
      i.last_value_cents,
      'USD',
      'scryfall_bulk',
      NULL,
      jsonb_build_object(
        'quantity', i.quantity,
        'card_id', i.card_id,
        'note', 'daily revalue snapshot from scryfall_cards_raw payload.prices'
      ),
      NOW(),
      NOW()
    FROM user_collection_items i
    WHERE i.user_id = $1
      AND i.game = $3
      AND i.last_value_cents IS NOT NULL
    ON CONFLICT ON CONSTRAINT ux_uc_item_vals_user_item_date_source
    DO UPDATE SET
      value_cents = EXCLUDED.value_cents,
      meta       = EXCLUDED.meta,
      updated_at = NOW();
  `;

  await client.query(snapSql, [userId, asOfDate, GAME]);

  // 3) Totals for logging
  const totals = await client.query(
    `
      SELECT
        COUNT(*)::int AS items,
        COALESCE(SUM(quantity), 0)::int AS copies,
        COALESCE(SUM(last_value_cents), 0)::bigint AS total_value_cents
      FROM user_collection_items
      WHERE user_id = $1
        AND game = $2
    `,
    [userId, GAME]
  );

  return {
    updatedCount,
    items: totals.rows?.[0]?.items ?? 0,
    copies: totals.rows?.[0]?.copies ?? 0,
    totalValueCents: Number(totals.rows?.[0]?.total_value_cents ?? 0),
  };
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  let job = null;

  try {
    // Claim one queued job atomically
    await client.query("BEGIN");

    const found = await client.query(
      `
      SELECT id, user_id
      FROM user_revalue_jobs
      WHERE status = 'queued'
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
      `
    );

    if (found.rows.length === 0) {
      await client.query("ROLLBACK");
      console.log("[revalueJobs] no queued jobs");
      return;
    }

    job = found.rows[0];

    await client.query(
      `
      UPDATE user_revalue_jobs
      SET status='running', started_at=now(), error=NULL
      WHERE id=$1
      `,
      [job.id]
    );

    await client.query("COMMIT");

    const userId = job.user_id;
    console.log(`[revalueJobs] running job ${job.id} for user ${userId} (game=${GAME})`);

    const result = await revalueUserInDb(client, userId);
    console.log("[revalueJobs] result:", result);

    await client.query(
      `
      UPDATE user_revalue_jobs
      SET status='done', finished_at=now()
      WHERE id=$1
      `,
      [job.id]
    );
  } catch (err) {
    const msg = err instanceof Error ? err.stack || err.message : String(err);
    console.error("[revalueJobs] failed:", msg);

    if (job?.id) {
      try {
        await client.query(
          `
          UPDATE user_revalue_jobs
          SET status='failed', finished_at=now(), error=$2
          WHERE id=$1
          `,
          [job.id, msg]
        );
      } catch {
        // best-effort
      }
    }

    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
