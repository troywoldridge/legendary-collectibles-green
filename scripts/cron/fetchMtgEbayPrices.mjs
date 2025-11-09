/* eslint-disable no-console */
import 'dotenv/config';
import { setTimeout as sleep } from 'node:timers/promises';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { db } from './_db.js';

/**
 * Usage examples:
 *   node scripts/cron/fetchMtgEbayPrices.mjs --all --limit=0 --batch=800 --concurrency=4
 *   node scripts/cron/fetchMtgEbayPrices.mjs --only-missing-ebay --days=3 --base=https://legendary-collectibles.com
 *
 * ENV (required):
 *   EBAY_CLIENT_ID
 *   EBAY_CLIENT_SECRET
 *   CRON_SECRET              <-- REQUIRED because we call /api/ebay/price with ?persist=1
 *
 * Optional:
 *   EBAY_MARKETPLACE (default EBAY_US) – used by the API route itself
 *   EBAY_SCOPE (default https://api.ebay.com/oauth/api_scope) – used by the API route itself
 *   EBAY_PRICE_BASE_URL (override base for the API route, e.g., http://127.0.0.1:3000)
 */

// -------- CLI flags --------
const argv = process.argv.slice(2);
const flags = new Map(
  argv.map((s) => {
    const i = s.indexOf('=');
    if (i === -1) return [s.replace(/^--/, ''), 'true'];
    return [s.slice(2, i), s.slice(i + 1)];
  }),
);

const FLAG_ALL               = flags.has('all');                  // (informational; no extra filter)
const FLAG_ONLY_MISSING_PRIM = flags.has('only-missing-primary'); // filter: no primary price present
const FLAG_ONLY_MISSING_EBAY = flags.has('only-missing-ebay');    // filter: no ebay snapshot in N days
const DAYS_FRESH             = Number(flags.get('days') ?? '7');
const LIMIT                  = Number(flags.get('limit') ?? '0'); // 0 = all
const BATCH                  = Math.max(50, Number(flags.get('batch') ?? '500'));
const CONCURRENCY            = Math.min(8, Math.max(1, Number(flags.get('concurrency') ?? '4')));
const START_AFTER            = flags.get('startAfter') || null;
const DRY_RUN                = flags.has('dry-run');
const FLAG_VERBOSE           = flags.has('verbose');

// Prefer explicit flag -> env -> sensible prod default
const BASE_URL = (flags.get('base') || process.env.EBAY_PRICE_BASE_URL || 'https://legendary-collectibles.com')
  .replace(/\/+$/, '');

// ---------- ENV sanity ----------
if (!process.env.EBAY_CLIENT_ID || !process.env.EBAY_CLIENT_SECRET) {
  console.error('Fatal: EBAY_CLIENT_ID/EBAY_CLIENT_SECRET missing');
  process.exit(1);
}
if (!process.env.CRON_SECRET) {
  console.error('Fatal: CRON_SECRET missing (required when using ?persist=1)');
  process.exit(1);
}

// Gentle warning if someone points the job at ADAP by mistake
if (/adapnow\.com/i.test(BASE_URL)) {
  console.warn(`[warn] BASE_URL is "${BASE_URL}" which looks like the ADAP site. For LC prices use legendary-collectibles.com.`);
}

const PRICE_ENDPOINT = (id) => `${BASE_URL}/api/ebay/price/${encodeURIComponent(id)}?persist=1`;

// -------- helpers --------
async function getIdsPage({ after, limit }) {
  // Keyset pagination on c.id to avoid huge OFFSET
  const whereParts = [];
  if (after) whereParts.push(sql`c.id > ${after}`);
  else whereParts.push(sql`TRUE`);

  if (FLAG_ONLY_MISSING_PRIM) {
    whereParts.push(sql`
      COALESCE(
        e.effective_usd, e.effective_usd_foil, e.effective_usd_etched, e.effective_eur, e.effective_tix,
        s.usd, s.usd_foil, s.usd_etched, s.eur, s.tix
      ) IS NULL
    `);
  }

  if (FLAG_ONLY_MISSING_EBAY) {
    whereParts.push(sql`
      NOT EXISTS (
        SELECT 1
        FROM public.ebay_price_snapshots es
        WHERE es.game = 'mtg'
          AND es.scryfall_id = c.id
          AND es.created_at >= NOW() - INTERVAL '${DAYS_FRESH} days'
      )
    `);
  }

  const where = whereParts.reduce((a, b) => sql`${a} AND ${b}`);

  const rows = await db.execute(sql`
    SELECT c.id::text AS id
    FROM public.mtg_cards c
    LEFT JOIN public.mtg_prices_effective e ON e.scryfall_id = c.id
    LEFT JOIN public.mtg_prices_scryfall  s ON s.scryfall_id  = c.id
    WHERE ${where}
    ORDER BY c.id ASC
    LIMIT ${limit}
  `);

  return rows.rows?.map((r) => r.id) ?? [];
}

function isJson(res) {
  const ct = res.headers.get('content-type') || '';
  return /\bjson\b/i.test(ct);
}

async function fetchOne(id) {
  const url = PRICE_ENDPOINT(id);
  if (FLAG_VERBOSE) console.log('[ebay] GET', url);

  let res;
  try {
    // ⬇️ Send CRON headers so the API allows persistence
    res = await fetch(url, {
      method: 'GET',
      headers: {
        'x-cron': '1',
        'x-cron-key': process.env.CRON_SECRET || '',
      },
    });
  } catch (e) {
    throw new Error(`Fetch failed: ${e.message}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (!isJson(res)) {
      console.warn(`[ebay] Non-JSON response (status ${res.status}) from ${url}`);
      console.warn('        First 200 chars:', body.slice(0, 200).replace(/\s+/g, ' '));
    } else {
      console.warn(`[ebay] ${res.status} JSON error from ${url}:`, body.slice(0, 500));
    }
    throw new Error(`HTTP ${res.status}`);
  }

  if (!isJson(res)) {
    const sample = await res.text().catch(() => '');
    console.warn('[ebay] OK but content-type not JSON; body(first 200):', sample.slice(0, 200).replace(/\s+/g, ' '));
    // try to parse anyway
    try {
      return JSON.parse(sample);
    } catch {
      return { ok: false, error: 'non-json-ok' };
    }
  }

  return res.json();
}

async function poolRun(ids, concurrency) {
  let inFlight = 0;
  let idx = 0;
  const results = [];
  let resolveAll, rejectAll;
  const done = new Promise((res, rej) => {
    resolveAll = res;
    rejectAll = rej;
  });

  const launch = () => {
    if (idx >= ids.length && inFlight === 0) return resolveAll(results);
    while (inFlight < concurrency && idx < ids.length) {
      const id = ids[idx++];
      inFlight++;
      fetchOne(id)
        .then((r) => results.push([id, null, r]))
        .catch((e) => results.push([id, e, null]))
        .finally(() => {
          inFlight--;
          launch();
        });
    }
  };
  launch();
  return done;
}

// resume file (optional)
const STATE_DIR = 'logs';
const CURSOR_FILE = `${STATE_DIR}/ebay-mtg.cursor`;
if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
function loadCursor() {
  if (START_AFTER) return START_AFTER;
  try {
    return readFileSync(CURSOR_FILE, 'utf8').trim() || null;
  } catch {
    return null;
  }
}
function saveCursor(id) {
  try {
    writeFileSync(CURSOR_FILE, id + '\n');
  } catch {}
}

// -------- main loop --------
console.log('MTG eBay harvester starting…');
console.log({
  base: BASE_URL,
  all: FLAG_ALL,
  onlyMissingPrimary: FLAG_ONLY_MISSING_PRIM,
  onlyMissingEbay: FLAG_ONLY_MISSING_EBAY,
  days: DAYS_FRESH,
  limit: LIMIT,
  batch: BATCH,
  concurrency: CONCURRENCY,
  startAfter: START_AFTER || '(state)',
  dryRun: DRY_RUN,
  verbose: FLAG_VERBOSE,
});

let processed = 0;
let found = 0;
let errors = 0;
let cursor = loadCursor();

while (true) {
  const toFetch = await getIdsPage({ after: cursor, limit: BATCH });
  if (toFetch.length === 0) break;

  const remainingCap = LIMIT > 0 ? Math.max(0, LIMIT - processed) : toFetch.length;
  const ids = toFetch.slice(0, remainingCap);
  if (ids.length === 0) break;

  console.log(`\nBatch ${processed + 1}..${processed + ids.length} (cursor from ${cursor || 'START'})`);

  if (!DRY_RUN) {
    const results = await poolRun(ids, CONCURRENCY);
    for (const [id, err, res] of results) {
      if (err) {
        errors++;
        console.warn('  •', id, '→ ERROR:', err.message);
        continue;
      }
      // expected: { ok: true, q, item } or { ok: true, item: null } or { ok:false,error }
      const price = res?.item?.price?.value;
      if (res?.ok && price) {
        found++;
        const urlOk = res?.item?.itemWebUrl ? '(url ok)' : '';
        console.log('  •', id, '→ $' + price, urlOk);
      } else if (res?.ok) {
        console.log('  •', id, '→ not found');
      } else {
        errors++;
        console.warn('  •', id, '→ route error:', res?.error ?? 'unknown');
      }
    }
  }

  processed += ids.length;
  cursor = ids[ids.length - 1];
  saveCursor(cursor);

  // progress line
  console.log(`Progress: processed=${processed}  found=${found}  errors=${errors}`);

  if (LIMIT > 0 && processed >= LIMIT) break;
  await sleep(100); // polite tiny delay
}

console.log(`\nDone. Processed=${processed}  Found=${found}  Errors=${errors}`);
