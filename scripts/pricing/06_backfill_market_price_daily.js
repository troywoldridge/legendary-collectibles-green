#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * 06_backfill_market_price_daily.js
 *
 * Backfills market_price_daily for a date range, using market_price_snapshots as the source of truth.
 *
 * For each day D:
 *   - choose the "best" snapshot per market_item_id where snapshot.as_of_date <= D
 *   - insert/update market_price_daily at as_of_date = D (carry-forward)
 *
 * Usage:
 *   node scripts/pricing/06_backfill_market_price_daily.js --currency USD --days 365
 *
 * Options:
 *   --currency USD
 *   --days 365                    (default 90)
 *   --end-date YYYY-MM-DD         (default today)
 *   --start-date YYYY-MM-DD       (optional override; if provided, ignores --days)
 *   --dry-run                     (prints plan, does not write)
 *
 * Env:
 *   DATABASE_URL=postgres://...
 */

const { Client } = require("pg");

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function isoDateUTC(d) {
  // returns YYYY-MM-DD in UTC
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

function parseISODate(s) {
  // strict-ish YYYY-MM-DD → Date at UTC midnight
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ""))) return null;
  const [y, m, d] = s.split("-").map((x) => Number(x));
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

function addDaysUTC(d, days) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function toInt(n, fallback) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL not set");
  process.exit(1);
}

/**
 * Same priorities you’re using elsewhere.
 * Lower number = higher priority
 */
const SOURCE_PRIORITY_SQL = `
  CASE s.source
    WHEN 'tcgplayer' THEN 10
    WHEN 'scryfall' THEN 20
    WHEN 'cardmarket' THEN 30
    WHEN 'pricecharting' THEN 40
    WHEN 'ebay' THEN 50
    WHEN 'amazon' THEN 60
    ELSE 99
  END
`;

const PRICE_TYPE_PRIORITY_SQL = `
  CASE s.price_type
    WHEN 'market' THEN 10
    WHEN 'trend' THEN 12
    WHEN 'mid' THEN 14
    WHEN 'avg_7d' THEN 16
    WHEN 'avg_30d' THEN 18
    WHEN 'low' THEN 22
    WHEN 'high' THEN 24
    WHEN 'loose' THEN 30
    WHEN 'cib' THEN 32
    WHEN 'new' THEN 34
    WHEN 'graded' THEN 36
    WHEN 'foil' THEN 60
    WHEN 'etched' THEN 62
    WHEN 'tix' THEN 80
    ELSE 90
  END
`;

async function upsertForDay(client, currency, dayISO) {
  // We return a count via a wrapper SELECT count(*) FROM ins
  const sql = `
    WITH ranked AS (
      SELECT
        s.market_item_id,
        s.as_of_date AS snapshot_date,
        s.currency,
        s.value_cents,
        s.source,
        s.price_type,
        s.condition,
        s.raw,
        ROW_NUMBER() OVER (
          PARTITION BY s.market_item_id, s.currency
          ORDER BY
            s.as_of_date DESC,
            ${SOURCE_PRIORITY_SQL} ASC,
            ${PRICE_TYPE_PRIORITY_SQL} ASC,
            s.value_cents DESC
        ) AS rn
      FROM public.market_price_snapshots s
      WHERE s.currency = $1
        AND s.as_of_date <= $2::date
        AND s.value_cents IS NOT NULL
    ),
    best AS (
      SELECT
        market_item_id,
        $2::date AS as_of_date,
        currency,
        value_cents,
        70::int AS confidence,
        jsonb_build_array(
          jsonb_build_object(
            'source', source,
            'price_type', price_type,
            'condition', condition,
            'value_cents', value_cents,
            'snapshot_date', snapshot_date
          )
        ) AS sources_used,
        'priority_fallback'::text AS method
      FROM ranked
      WHERE rn = 1
    ),
    ins AS (
      INSERT INTO public.market_price_daily (
        market_item_id,
        as_of_date,
        currency,
        value_cents,
        confidence,
        sources_used,
        method,
        updated_at
      )
      SELECT
        market_item_id,
        as_of_date,
        currency,
        value_cents,
        confidence,
        sources_used,
        method,
        now()
      FROM best
      ON CONFLICT (market_item_id, as_of_date, currency)
      DO UPDATE SET
        value_cents = EXCLUDED.value_cents,
        confidence = EXCLUDED.confidence,
        sources_used = EXCLUDED.sources_used,
        method = EXCLUDED.method,
        updated_at = now()
      RETURNING 1
    )
    SELECT COUNT(*)::int AS n FROM ins;
  `;

  const { rows } = await client.query(sql, [currency, dayISO]);
  return rows?.[0]?.n ?? 0;
}

(async function main() {
  const args = parseArgs(process.argv);

  const currency = (args.currency || "USD").toUpperCase();
  const dryRun = !!args["dry-run"];

  const todayISO = new Date().toISOString().slice(0, 10);
  const endISO = args["end-date"] || args.endDate || todayISO;

  const endDate = parseISODate(endISO);
  if (!endDate) {
    console.error(`❌ Invalid --end-date "${endISO}" (expected YYYY-MM-DD)`);
    process.exit(1);
  }

  let startDate = null;

  const startISO = args["start-date"] || args.startDate || null;
  if (startISO) {
    startDate = parseISODate(startISO);
    if (!startDate) {
      console.error(`❌ Invalid --start-date "${startISO}" (expected YYYY-MM-DD)`);
      process.exit(1);
    }
  } else {
    const days = toInt(args.days, 90);
    // inclusive range: start = end - (days-1)
    startDate = addDaysUTC(endDate, -(Math.max(1, days) - 1));
  }

  if (startDate > endDate) {
    console.error(`❌ start-date is after end-date (${isoDateUTC(startDate)} > ${isoDateUTC(endDate)})`);
    process.exit(1);
  }

  const startOut = isoDateUTC(startDate);
  const endOut = isoDateUTC(endDate);

  console.log(`🧱 Backfilling market_price_daily`);
  console.log(`   currency:   ${currency}`);
  console.log(`   start-date: ${startOut}`);
  console.log(`   end-date:   ${endOut}`);
  console.log(`   mode:       ${dryRun ? "DRY RUN" : "WRITE"}`);

  if (dryRun) {
    console.log("✅ Dry run complete (no DB writes).");
    process.exit(0);
  }

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  const t0 = Date.now();

  try {
    let day = startDate;
    let totalUpserts = 0;
    let daysDone = 0;

    while (day <= endDate) {
      const dayISO = isoDateUTC(day);
      const n = await upsertForDay(client, currency, dayISO);

      totalUpserts += n;
      daysDone += 1;

      console.log(`📅 ${dayISO} -> upserted ${n} rows`);

      day = addDaysUTC(day, 1);
    }

    const ms = Date.now() - t0;
    console.log(`\n✅ Done. Days: ${daysDone}, total upserts: ${totalUpserts}, ms: ${ms}`);
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error("❌ Error:", e?.message || e);
  process.exit(1);
});
