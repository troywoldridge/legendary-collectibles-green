/* eslint-disable no-console */
// Node 18+ (ESM)
import 'dotenv/config';
import { Pool } from 'pg';
import { request } from 'undici';
import pLimit from 'p-limit';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ---------- DB bootstrap ----------
const SQL_BOOTSTRAP = `
CREATE TABLE IF NOT EXISTS ygo_card_prices (
  card_id text PRIMARY KEY,
  tcgplayer_price numeric,
  cardmarket_price numeric,
  ebay_price numeric,
  amazon_price numeric,
  coolstuffinc_price numeric
);
ALTER TABLE ygo_card_prices
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS ygo_card_prices_updated_idx ON ygo_card_prices(updated_at);
`;

const UPSERT_SQL = `
INSERT INTO ygo_card_prices
  (card_id, tcgplayer_price, cardmarket_price, ebay_price, amazon_price, coolstuffinc_price, updated_at)
VALUES
  ($1,$2,$3,$4,$5,$6, now())
ON CONFLICT (card_id) DO UPDATE SET
  tcgplayer_price = EXCLUDED.tcgplayer_price,
  cardmarket_price = EXCLUDED.cardmarket_price,
  ebay_price = EXCLUDED.ebay_price,
  amazon_price = EXCLUDED.amazon_price,
  coolstuffinc_price = EXCLUDED.coolstuffinc_price,
  updated_at = now();
`;

// ---------- helpers ----------
const API = 'https://db.ygoprodeck.com/api/v7/cardinfo.php';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const backoff = (n) => Math.min(30000, 500 * 2 ** n);
const looksNumeric = (s) => /^\d+$/.test(String(s || ''));
const toNum = (x) => (x == null ? null : (Number.isFinite(Number(x)) ? Number(x) : null));
const skipByName = (name) => /token\b/i.test(name) || /\(skill card\)/i.test(name);
const canonName = (name) =>
  String(name || '')
    .replace(/\([^)]+\)/g, ' ')         // drop parentheticals e.g. (Skill Card)
    .replace(/[^A-Za-z0-9\s'-]/g, ' ')  // strip punctuation
    .replace(/\s+/g, ' ')
    .trim();

async function getJson(url) {
  const res = await request(url, { method: 'GET' });
  const txt = await res.body.text();
  if (res.statusCode === 404) {
    const err = new Error('HTTP 404');
    err.status = 404;
    throw err;
  }
  if (res.statusCode >= 500) {
    const err = new Error(`HTTP ${res.statusCode}`);
    err.status = res.statusCode;
    throw err;
  }
  if (res.statusCode !== 200) throw new Error(`HTTP ${res.statusCode} ${txt.slice(0, 180)}`);
  return JSON.parse(txt);
}

async function fetchById(passcode, attempt = 0) {
  try { return await getJson(`${API}?id=${encodeURIComponent(passcode)}`); }
  catch (e) { if (e.status >= 500) { await sleep(backoff(attempt)); return fetchById(passcode, attempt + 1); } throw e; }
}
async function fetchByNameExact(name, attempt = 0) {
  try { return await getJson(`${API}?name=${encodeURIComponent(name)}`); }
  catch (e) { if (e.status >= 500) { await sleep(backoff(attempt)); return fetchByNameExact(name, attempt + 1); } throw e; }
}
async function fetchByFuzzy(name, attempt = 0) {
  try { return await getJson(`${API}?fname=${encodeURIComponent(name)}`); }
  catch (e) { if (e.status >= 500) { await sleep(backoff(attempt)); return fetchByFuzzy(name, attempt + 1); } throw e; }
}

// Choose the best result when multiple prints are returned
function pickCard(json, { card_id, name }) {
  const arr = json?.data || [];
  if (!arr.length) return undefined;
  const exact = arr.find(c => (c.name || '').toLowerCase() === (name || '').toLowerCase());
  if (exact) return exact;
  if (looksNumeric(card_id)) {
    const byId = arr.find(c => String(c.id) === String(card_id));
    if (byId) return byId;
  }
  return arr[0];
}

function extractPrices(json, row) {
  const card = pickCard(json, row);
  const p = card?.card_prices?.[0] ?? {};
  return {
    tcg: toNum(p.tcgplayer_price),
    cm:  toNum(p.cardmarket_price),
    eb:  toNum(p.ebay_price),
    amz: toNum(p.amazon_price),
    csi: toNum(p.coolstuffinc_price),
  };
}

async function fetchPrices(row) {
  const { card_id, name } = row;

  if (skipByName(name)) return { skip: true, reason: 'no-price-type' };

  // 1) passcode
  if (looksNumeric(card_id)) {
    try { return { prices: extractPrices(await fetchById(card_id), row) }; }
    catch (e) { if (e.status !== 404) throw e; /* continue */ }
  }

  // 2) exact name
  try { return { prices: extractPrices(await fetchByNameExact(name), row) }; }
  catch (e) { if (e.status !== 404) throw e; }

  // 3) fuzzy original
  try { return { prices: extractPrices(await fetchByFuzzy(name), row) }; }
  catch (e) { if (e.status !== 404) throw e; }

  // 4) fuzzy canonicalized
  const c = canonName(name);
  if (c && c !== name) {
    try { return { prices: extractPrices(await fetchByFuzzy(c), row) }; }
    catch (e) { if (e.status !== 404) throw e; }
  }

  return { skip: true, reason: 'not-found' };
}

// ---------- main ----------
async function main() {
  console.log('YGO prices — start');
  await pool.query(SQL_BOOTSTRAP);

  const { rows } = await pool.query(`SELECT card_id, name FROM ygo_cards`);
  console.log(`Found ${rows.length} cards`);

  const limit = pLimit(5);
  let ok = 0, skipped = 0, nf = 0, npt = 0;

  await Promise.all(rows.map((row) => limit(async () => {
    try {
      const r = await fetchPrices(row);
      if (r.skip) {
        skipped++;
        if (r.reason === 'not-found') nf++;
        if (r.reason === 'no-price-type') npt++;
        return;
      }
      const p = r.prices;
      await pool.query(UPSERT_SQL, [row.card_id, p.tcg, p.cm, p.eb, p.amz, p.csi]);
      ok++;
      if (ok % 250 === 0) console.log(`Upserted ${ok}/${rows.length}`);
    } catch (e) {
      skipped++;
      console.warn(`Skip ${row.card_id} (${row.name}) ${e.message}`);
    }
  })));

  console.log(`YGO prices — done. Upserted=${ok}, Skipped=${skipped} (not-found=${nf}, no-price=${npt})`);
  await pool.end();
}

main().catch((e) => { console.error('Failed:', e); process.exit(1); });
