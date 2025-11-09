/* eslint-disable no-console */
// Accuracy-focused eBay price snapshotter
// Node 20+
//
// pnpm add pg p-limit
//
// ENV:
//   DATABASE_URL=postgres://user:pass@host:5432/db
//   EBAY_ENV=PROD
//   EBAY_CLIENT_ID=...      # App ID (Client ID) for Finding API (Completed Items)
//   EBAY_CLIENT_SECRET=...  # Not used by Finding API; kept for optional Browse
//   EBAY_SCOPE=https://api.ebay.com/oauth/api_scope
//   EBAY_MODE=COMPLETED     # COMPLETED (default, sold comps via Finding API) | ACTIVE (Browse API)
//   EBAY_RATE_DELAY_MS=300
//   EBAY_MAX_RESULTS=200
//   EBAY_PAGE_SIZE=100
//
// Run examples:
//   node scripts/cron/ebayPriceSnapshot.mjs --category=sports --since=1900 --until=2025 --concurrency=3
//   node scripts/cron/ebayPriceSnapshot.mjs --category=pokemon --limit=1000
//   node scripts/cron/ebayPriceSnapshot.mjs --category=all --limit=500

import 'dotenv/config';
import { Pool } from 'pg';
import pLimit from 'p-limit';

const {
  DATABASE_URL,
  EBAY_ENV = 'PROD',
  EBAY_CLIENT_ID,
  EBAY_CLIENT_SECRET,
  EBAY_SCOPE = 'https://api.ebay.com/oauth/api_scope',
  EBAY_MODE = 'COMPLETED',
} = process.env;

if (!DATABASE_URL) { console.error('Missing DATABASE_URL'); process.exit(1); }
if (!EBAY_CLIENT_ID) { console.error('Missing EBAY_CLIENT_ID'); process.exit(1); }

const pool = new Pool({ connectionString: DATABASE_URL });
const UA = 'LegendaryCollectiblesBot/1.0 (+https://legendary-collectibles.com)';

const PER_HOST_DELAY_MS = Number(process.env.EBAY_RATE_DELAY_MS ?? 300);
const MAX_RESULTS = Number(process.env.EBAY_MAX_RESULTS ?? 200);
const PAGE_SIZE = Math.min(100, Number(process.env.EBAY_PAGE_SIZE ?? 100)); // Finding API max 100/page

// Category IDs (used for both APIs; tight scopes for accuracy)
const CATEGORY_IDS = {
  sports: '261328',   // Sports Trading Card Singles
  pokemon: '183454',  // CCG Individual Cards
  ygo: '183454',
  mtg: '183454',
};

const STOP_WORDS = /\b(lot|lots|box|case|blaster|hanger|retail|sealed|wax|break|team\s*break|nft|token|digital|custom|proxy|reprint|rc\s*logo|mystery|bundle|code|online\s*code|coin|pin|deck|booster|pack|vbox|collection|poster|figure|action\s*figure|funko)\b/i;
const PRE_SALE = /\bpre[ -]?sale|preorder|pre[- ]?order\b/i;
const GRADER = /\b(PSA|BGS|SGC|CGC|HGA)\b/i;
const GRADE_NUM = /\b(?:PSA|BGS|SGC|CGC|HGA)\s*-?\s*(?:10|9\.5|9|8\.5|8|7|6|5|4|3|2|1)\b/i;

// ---------- tiny utils ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const perHostTimers = new Map();
async function perHostDelay(url) {
  const host = new URL(url).host;
  const last = perHostTimers.get(host) ?? 0;
  const now = Date.now();
  const wait = PER_HOST_DELAY_MS - (now - last);
  if (wait > 0) await sleep(wait);
  perHostTimers.set(host, Date.now());
}
function cents(n) { return Math.round(Number(n) * 100); }
function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo));
}
function pruneOutliersCents(nums) {
  if (nums.length < 6) return nums.slice().sort((a,b)=>a-b);
  const arr = nums.slice().sort((a,b)=>a-b);
  const q1 = percentile(arr, 0.25);
  const q3 = percentile(arr, 0.75);
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  let pruned = arr.filter(n => n >= lo && n <= hi);
  if (pruned.length >= 6) {
    const med = percentile(pruned, 0.5);
    const mad = percentile(pruned.map(n => Math.abs(n - med)).sort((a,b)=>a-b), 0.5) || 1;
    pruned = pruned.filter(n => Math.abs(n - med) <= 5 * mad);
  }
  return pruned.length ? pruned : arr;
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// ---------- CLI args ----------
function args() {
  const out = { category: 'sports', limit: null, since: null, until: null, concurrency: 3 };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--category=')) out.category = a.split('=')[1];         // sports | pokemon | ygo | mtg | all
    if (a.startsWith('--limit=')) out.limit = Number(a.split('=')[1] || 0) || null;
    if (a.startsWith('--since=')) out.since = Number(a.split('=')[1] || 0) || null;
    if (a.startsWith('--until=')) out.until = Number(a.split('=')[1] || 0) || null;
    if (a.startsWith('--concurrency=')) out.concurrency = Number(a.split('=')[1] || 3);
  }
  return out;
}

// ---------- DB selection (NO async-iterable; return arrays) ----------
async function pickCardsOne({ category, limit = 2000, since = null, until = null }) {
  if (category === 'sports') {
    const params = [];
    let where = 'WHERE 1=1';
    if (since != null) { params.push(since); where += ` AND (year IS NULL OR year >= $${params.length})`; }
    if (until != null) { params.push(until); where += ` AND (year IS NULL OR year <= $${params.length})`; }
    params.push(limit);
    const { rows } = await pool.query(
      `
      SELECT id, 'sports' AS category, sport, year, set_name, number, player, team
      FROM sc_cards
      ${where}
      ORDER BY year DESC NULLS LAST, set_name, number
      LIMIT $${params.length}
      `,
      params
    );
    return rows;
  }

  if (category === 'pokemon') {
    // These columns match your pages: tcg_cards(id, name, set_name, set_id)
    const { rows } = await pool.query(
      `
      SELECT
        c.id, 'pokemon' AS category, c.name, c.set_name, c.set_id
      FROM tcg_cards c
      ORDER BY c.set_name NULLS LAST, c.name
      LIMIT $1
      `,
      [limit]
    );
    return rows;
  }

  if (category === 'ygo') {
    // ygo_cards(card_id PK, name)
    const { rows } = await pool.query(
      `
      SELECT
        card_id AS id, 'ygo' AS category, name
      FROM ygo_cards
      ORDER BY updated_at DESC NULLS LAST, name
      LIMIT $1
      `,
      [limit]
    );
    return rows;
  }

  if (category === 'mtg') {
    // Adjust table if different; kept simple
    try {
      const { rows } = await pool.query(
        `
        SELECT id, 'mtg' AS category, name, set_name
        FROM mtg_cards
        ORDER BY released_at DESC NULLS LAST, name
        LIMIT $1
        `,
        [limit]
      );
      return rows;
    } catch {
      console.warn('[mtg] table missing; skipping');
      return [];
    }
  }

  return [];
}

async function pickCards(opts) {
  if (opts.category === 'all') {
    const cats = ['sports', 'pokemon', 'ygo', 'mtg'];
    const out = [];
    for (const c of cats) {
      const part = await pickCardsOne({ ...opts, category: c });
      out.push(...part);
    }
    return out;
  }
  return pickCardsOne(opts);
}

// ---------- Query builder ----------
function makeEbayQuery(card) {
  const clean = (v) => (v == null ? "" : String(v).trim());
  const join = (parts) => parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

  switch (card.category) {
    case "sports":
      return join([
        clean(card.year),
        clean(card.set_name),
        clean(card.player),
        card.number ? `#${clean(card.number)}` : "",
        clean(card.team),
        clean(card.sport),
      ]);

    case "pokemon":
      return join([
        clean(card.set_name),
        clean(card.name),
        clean(card.id), // e.g. "sv9-123"
        "Pokemon",
        "TCG",
      ]);

    case "ygo":
      return join([clean(card.name), clean(card.id), "Yu-Gi-Oh", "TCG"]);

    case "mtg":
      return join([clean(card.set_name), clean(card.name), "Magic The Gathering", "MTG"]);

    default:
      return join([clean(card.set_name), clean(card.name), clean(card.id)]);
  }
}

// ---------- Title gating ----------
function buildNumberRegex(card) {
  const n = String(card.number || '').trim();
  if (!n) return null;
  const parts = [];
  parts.push(`#\\s*${n}\\b`);
  parts.push(`\\b${n}\\b`);
  if (/\d+\/\d+/.test(n)) parts.push(n.replace('/','\\/'));
  if (/^[A-Z]{1,5}-[A-Z]{1,3}\d{1,4}$/i.test(n)) parts.push(`\\b${n}\\b`);
  return new RegExp(`(?:${parts.join('|')})`, 'i');
}

function scoreTitleMatch(card, title) {
  const t = title || '';
  if (STOP_WORDS.test(t)) return { score: 0, graded: false, rejectReason: 'stopword' };
  if (PRE_SALE.test(t)) return { score: 0, graded: false, rejectReason: 'presale' };

  let score = 0;

  const name = (card.player || card.name || '').trim();
  if (name && new RegExp(`\\b${escapeRegex(name)}\\b`, 'i').test(t)) score += 30;

  if (card.set_name) {
    const sn = String(card.set_name).replace(/\s+/g, ' ').trim();
    if (sn && new RegExp(`\\b${escapeRegex(sn.split(' ')[0])}\\b`, 'i').test(t)) score += 15;
  }

  const numRe = buildNumberRegex(card);
  if (numRe && numRe.test(t)) score += 35;

  if (card.year && new RegExp(`\\b${String(card.year)}\\b`).test(t)) score += 10;

  if (card.sport && new RegExp(`\\b${escapeRegex(card.sport)}\\b`, 'i').test(t)) score += 6;

  const graded = GRADER.test(t) || GRADE_NUM.test(t);
  if (graded) score += 6;

  return { score, graded, rejectReason: null };
}

// ---------- eBay: COMPLETED (Finding API) ----------
async function fetchEbayCompletedListings(q, categoryKey) {
  const endpoint = `https://svcs.ebay.com/services/search/FindingService/v1`;
  const out = [];
  const catId = CATEGORY_IDS[categoryKey] || '';
  let gathered = 0;

  for (let page = 1; gathered < MAX_RESULTS; page++) {
    const url = new URL(endpoint);
    url.searchParams.set('OPERATION-NAME', 'findCompletedItems');
    url.searchParams.set('SERVICE-VERSION', '1.13.0');
    url.searchParams.set('SECURITY-APPNAME', EBAY_CLIENT_ID);
    url.searchParams.set('GLOBAL-ID', 'EBAY-US');
    url.searchParams.set('siteid', '0');
    url.searchParams.set('RESPONSE-DATA-FORMAT', 'JSON');
    url.searchParams.set('keywords', q);
    url.searchParams.set('paginationInput.entriesPerPage', String(PAGE_SIZE));
    url.searchParams.set('paginationInput.pageNumber', String(page));
    if (catId) url.searchParams.set('categoryId', catId);
    // Only SOLD items
    url.searchParams.set('itemFilter(0).name', 'SoldItemsOnly');
    url.searchParams.set('itemFilter(0).value', 'true');

    await perHostDelay(url.toString());
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) break;
    const data = await res.json();
    const items = data?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item || [];
    if (!items.length) break;

    for (const it of items) {
      const title = it?.title?.[0] || '';
      const selling = it?.sellingStatus?.[0];
      const sold = selling?.sellingState?.[0] === 'EndedWithSales';
      const price = Number(selling?.currentPrice?.[0]?.__value__ || 0);
      const ship = Number(it?.shippingInfo?.[0]?.shippingServiceCost?.[0]?.__value__ || 0);
      if (!sold || !price) continue;
      out.push({ title, totalCents: cents(price + (ship || 0)) });
      gathered++;
      if (gathered >= MAX_RESULTS) break;
    }

    // stop early if page was short
    if (items.length < PAGE_SIZE) break;
  }

  return out;
}

// ---------- eBay: ACTIVE (Browse API, optional) ----------
let ebayTokenCache = { token: null, exp: 0 };
async function getEbayToken() {
  if (!EBAY_CLIENT_SECRET) throw new Error('Browse API needs EBAY_CLIENT_SECRET');
  const now = Date.now();
  if (ebayTokenCache.token && now < ebayTokenCache.exp - 60_000) return ebayTokenCache.token;
  const base = EBAY_ENV.toUpperCase() === 'SANDBOX' ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';
  const auth = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString('base64');
  const body = new URLSearchParams({ grant_type: 'client_credentials', scope: EBAY_SCOPE });
  const res = await fetch(`${base}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) throw new Error(`eBay OAuth ${res.status}`);
  const j = await res.json();
  ebayTokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in || 7200) * 1000 };
  return ebayTokenCache.token;
}

async function fetchEbayActiveListings(q, categoryKey) {
  const token = await getEbayToken();
  const base = EBAY_ENV.toUpperCase() === 'SANDBOX' ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';
  const endpoint = `${base}/buy/browse/v1/item_summary/search`;
  const out = [];
  const catId = CATEGORY_IDS[categoryKey] || '';

  for (let offset = 0; offset < MAX_RESULTS; offset += Math.min(200, PAGE_SIZE)) {
    const url = new URL(endpoint);
    url.searchParams.set('q', q);
    url.searchParams.set('limit', String(Math.min(200, PAGE_SIZE)));
    url.searchParams.set('offset', String(offset));
    if (catId) url.searchParams.set('category_ids', catId);
    url.searchParams.set('filter',
      'priceCurrency:USD,conditions:{NEW|USED|VERY_GOOD|GOOD|ACCEPTABLE},buyingOptions:{FIXED_PRICE|AUCTION},itemLocationCountry:US'
    );

    await perHostDelay(url.toString());
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'User-Agent': UA,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
      }
    });
    if (!res.ok) break;
    const data = await res.json();
    const items = data?.itemSummaries || [];
    if (!items.length) break;

    for (const it of items) {
      const title = it?.title || '';
      const price = Number(it?.price?.value ?? 0);
      const ship = Number(it?.shippingOptions?.[0]?.shippingCost?.value ?? 0);
      if (!price) continue;
      out.push({ title, totalCents: cents(price + (ship || 0)) });
    }

    if (items.length < Math.min(200, PAGE_SIZE)) break;
  }

  return out;
}

// One switch to choose the data source
async function fetchEbayListings(q, categoryKey) {
  if (EBAY_MODE.toUpperCase() === 'ACTIVE') {
    return fetchEbayActiveListings(q, categoryKey);
  }
  return fetchEbayCompletedListings(q, categoryKey);
}

// ---------- Segment + stats ----------
function splitSegments(card, listings) {
  const raw = [], graded = [];
  for (const it of listings) {
    const { score, graded: isGraded, rejectReason } = scoreTitleMatch(card, it.title);
    if (rejectReason) continue;
    if (score < 50) continue;
    (isGraded ? graded : raw).push(it.totalCents);
  }
  return { raw: pruneOutliersCents(raw), graded: pruneOutliersCents(graded) };
}

function toStats(arr) {
  if (!arr.length) return null;
  const s = arr.slice().sort((a,b)=>a-b);
  return {
    sample_count: s.length,
    min_cents: s[0],
    p25_cents: percentile(s, 0.25),
    median_cents: percentile(s, 0.5),
    p75_cents: percentile(s, 0.75),
    max_cents: s[s.length - 1],
    avg_cents: Math.round(s.reduce((a,b)=>a+b,0)/s.length),
    currency: 'USD'
  };
}

// ---------- Persist (idempotent-ish: delete-then-insert) ----------
async function saveSnapshot(cardId, category, segment, snap) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM ebay_price_snapshots WHERE card_id=$1 AND category=$2 AND segment=$3`,
      [cardId, category, segment]
    );
    await client.query(
      `
      INSERT INTO ebay_price_snapshots
        (card_id, category, segment, sample_count, min_cents, p25_cents, median_cents, p75_cents, max_cents, avg_cents, currency)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      `,
      [
        cardId, category, segment,
        snap.sample_count, snap.min_cents, snap.p25_cents, snap.median_cents, snap.p75_cents,
        snap.max_cents, snap.avg_cents, snap.currency
      ]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ---------- Main ----------
async function main() {
  const opts = args();
  console.log('eBay price snapshot:', { ...opts, mode: EBAY_MODE, MAX_RESULTS, PAGE_SIZE });

  // OPTIONAL: ensure table (comment out if you already migrated)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ebay_price_snapshots (
      id bigserial PRIMARY KEY,
      card_id text NOT NULL,
      category text NOT NULL,
      segment text NOT NULL,           -- 'raw' | 'graded' | 'all'
      sample_count int NOT NULL,
      min_cents int NOT NULL,
      p25_cents int NOT NULL,
      median_cents int NOT NULL,
      p75_cents int NOT NULL,
      max_cents int NOT NULL,
      avg_cents int NOT NULL,
      currency text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS eps_card_cat_seg_idx ON ebay_price_snapshots(card_id, category, segment);
  `);

  const cards = await pickCards(opts);
  console.log(`Loaded ${cards.length} cards to process`);

  const limit = pLimit(Number(opts.concurrency || 3));
  let processed = 0, saved = 0;

  await Promise.all(
    cards.map((card) =>
      limit(async () => {
        try {
          const q = makeEbayQuery(card);
          if (!q) return;
          const listings = await fetchEbayListings(q, card.category);
          const { raw, graded } = splitSegments(card, listings);

          const rawStats = toStats(raw);
          const gradedStats = toStats(graded);
          const allStats = toStats(pruneOutliersCents(raw.concat(graded)));

          processed += 1;

          if (rawStats) { await saveSnapshot(card.id, card.category, 'raw', rawStats); saved++; }
          if (gradedStats) { await saveSnapshot(card.id, card.category, 'graded', gradedStats); saved++; }
          if (allStats) { await saveSnapshot(card.id, card.category, 'all', allStats); saved++; }

          const note = [
            rawStats ? `raw n=${rawStats.sample_count} med=$${(rawStats.median_cents/100).toFixed(2)}` : 'raw n=0',
            gradedStats ? `graded n=${gradedStats.sample_count} med=$${(gradedStats.median_cents/100).toFixed(2)}` : 'graded n=0'
          ].join(' | ');
          console.log(`[${card.category}] ${card.id} :: ${q} — ${note}`);
        } catch (e) {
          console.warn('card error', card.id, e.message);
        }
      })
    )
  );

  console.log(`Done. processed=${processed} snapshotsSaved=${saved}`);
  await pool.end();
}

main().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
