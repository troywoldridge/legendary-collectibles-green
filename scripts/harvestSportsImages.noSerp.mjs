/* eslint-disable no-console */
// Node 20+
// Deps:
//   pnpm add pg sharp imghash p-limit cheerio
//
// ENV:
//   DATABASE_URL=postgres://user:pass@host:5432/db
//   # Optional Cloudflare Images (uploads):
//   CF_ACCOUNT_ID=...
//   CF_IMAGES_TOKEN=...
//   CF_ACCOUNT_HASH=...
//   # eBay Browse API (Option B):
//   EBAY_ENV=PROD            # or SANDBOX
//   EBAY_CLIENT_ID=...
//   EBAY_CLIENT_SECRET=...
//   EBAY_SCOPE=https://api.ebay.com/oauth/api_scope
//   # Sweeper tuning:
//   HARVEST_BATCH_SIZE=200
//   HARVEST_CONCURRENCY=3
//   HARVEST_PER_HOST_DELAY_MS=900
//   AUTO_PROMOTE_MIN=88
//
// Run (quick "needs images"):
//   node scripts/harvestSportsImages.noSerp.mjs --limit=300 --since=2010 --sport=basketball --auto-promote
//
// Run (sweep ALL cards in batches, skipping ones that already have an image):
//   node scripts/harvestSportsImages.noSerp.mjs --all --since=2010 --sport=basketball --auto-promote

import 'dotenv/config';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import imghash from 'imghash';
import { Pool } from 'pg';
import pLimit from 'p-limit';
import * as cheerio from 'cheerio';

const {
  DATABASE_URL,
  CF_ACCOUNT_ID,
  CF_IMAGES_TOKEN,
  CF_ACCOUNT_HASH,
} = process.env;

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

// -------------------- Config --------------------
const CONCURRENCY = Number(process.env.HARVEST_CONCURRENCY ?? 3);
const PER_HOST_DELAY_MS = Number(process.env.HARVEST_PER_HOST_DELAY_MS ?? 900);
const AUTO_PROMOTE_MIN = Number(process.env.AUTO_PROMOTE_MIN ?? 88);
const MAX_BYTES = 12 * 1024 * 1024; // 12MB
const ACCEPT_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']); // allowlist
const BATCH_SIZE = Number(process.env.HARVEST_BATCH_SIZE ?? 200);

// Order matters: prefer API → HTML fallbacks
const SOURCE_ORDER = ['tcdb', 'ebayBrowse', 'comc', 'ebay'];

const UA =
  'LegendaryCollectiblesBot/1.0 (+https://legendary-collectibles.com; polite; contact admin)';

// -------------------- helpers --------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const perHostTimers = new Map();
async function perHostDelay(url) {
  try {
    const u = new URL(url);
    const key = u.host;
    const last = perHostTimers.get(key) ?? 0;
    const now = Date.now();
    const elapsed = now - last;
    if (elapsed < PER_HOST_DELAY_MS) await sleep(PER_HOST_DELAY_MS - elapsed);
    perHostTimers.set(key, Date.now());
  } catch {}
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

async function computePhash(buf) {
  // normalize via sharp then pHash; 16x16 grid for decent granularity
  const tmp = await sharp(buf).ensureAlpha().png().toBuffer();
  return imghash.hash(tmp, 16, 'hex');
}

async function getImageMeta(buf) {
  const meta = await sharp(buf).metadata();
  return {
    width: meta.width ?? null,
    height: meta.height ?? null,
  };
}

function scoreMatch(card, candidate) {
  // 0..100 heuristic
  let s = 0;

  if (
    card.number &&
    candidate.number &&
    String(card.number).toLowerCase() === String(candidate.number).toLowerCase()
  )
    s += 30;
  if (card.sport && candidate.sport && card.sport.toLowerCase() === candidate.sport.toLowerCase())
    s += 18;
  if (card.year && candidate.year && Number(card.year) === Number(candidate.year)) s += 16;

  if (card.set_name && candidate.set_name) {
    const a = card.set_name.toLowerCase();
    const b = candidate.set_name.toLowerCase();
    if (a === b) s += 18;
    else if (a.includes(b) || b.includes(a)) s += 12;
  }

  if (card.player && candidate.player) {
    const a = card.player.toLowerCase();
    const b = candidate.player.toLowerCase();
    if (a === b) s += 14;
    else if (a.includes(b) || b.includes(a)) s += 8;
  }

  if (s < 20 && (candidate.number || candidate.player) && (candidate.set_name || candidate.year)) s += 8;

  return Math.min(100, s);
}

// --- fetch-based download with redirect support ---
async function downloadImage(url) {
  await perHostDelay(url);

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': UA,
      'Accept': [...ACCEPT_MIME].join(','),
      'Accept-Language': 'en-US,en;q=0.8',
      'Referer': new URL(url).origin,
    },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

  const ct = res.headers.get('content-type') || '';
  if (![...ACCEPT_MIME].some((m) => ct.includes(m))) {
    throw new Error(`Unsupported content-type ${ct}`);
  }

  // Stream with size cap
  const reader = res.body.getReader();
  const chunks = [];
  let bytes = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_BYTES) {
      reader.cancel();
      throw new Error(`Too large (${bytes} bytes)`);
    }
    chunks.push(Buffer.from(value));
  }

  const buf = Buffer.concat(chunks);
  return { buf, contentType: ct };
}

// --- HTML fetch helper ---
async function fetchHtml(url) {
  await perHostDelay(url);

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,*/*',
      'Accept-Language': 'en-US,en;q=0.8',
      'Referer': new URL(url).origin,
    },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

async function cfImagesUpload(buf) {
  if (!CF_ACCOUNT_ID || !CF_IMAGES_TOKEN) return null;
  await sleep(250);
  const form = new FormData();
  form.append('file', new Blob([buf]), 'card-image');
  const upload = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/images/v1`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${CF_IMAGES_TOKEN}` },
      body: form,
    }
  );
  const data = await upload.json();
  if (!data?.success) {
    console.warn('CF Images upload failed', data?.errors);
    return null;
  }
  return data?.result?.id ?? null;
}

function cfPublicUrl(cfImageId, variant = 'card') {
  if (!CF_ACCOUNT_HASH || !cfImageId) return null;
  return `https://imagedelivery.net/${CF_ACCOUNT_HASH}/${cfImageId}/${variant}`;
}

// -------------------- DB ops --------------------
async function pickCardsNeedingImages({ limit = 200, sport, sinceYear } = {}) {
  const args = [];
  let where = 'WHERE NOT EXISTS (SELECT 1 FROM sc_images i WHERE i.card_id = c.id)';
  if (sport) {
    args.push(sport);
    where += ` AND lower(c.sport) = lower($${args.length})`;
  }
  if (sinceYear) {
    args.push(sinceYear);
    where += ` AND (c.year IS NULL OR c.year >= $${args.length})`;
  }
  args.push(limit);

  const { rows } = await pool.query(
    `
    SELECT c.id, c.sport, c.year, c.set_name, c.number, c.player, c.team, c.canonical_key
    FROM sc_cards c
    ${where}
    ORDER BY c.year DESC NULLS LAST, c.set_name, c.number
    LIMIT $${args.length}
    `,
    args
  );
  return rows;
}

// Sweep ALL cards (in batches), also telling us if an image already exists
async function pickCardsAll({ offset = 0, batchSize = BATCH_SIZE, sport, sinceYear } = {}) {
  const args = [sport ?? null, sinceYear ?? null, batchSize, offset];
  const { rows } = await pool.query(
    `
    SELECT
      c.id, c.sport, c.year, c.set_name, c.number, c.player, c.team, c.canonical_key,
      EXISTS (SELECT 1 FROM sc_images i WHERE i.card_id = c.id LIMIT 1) AS has_image
    FROM sc_cards c
    WHERE ($1::text IS NULL OR lower(c.sport) = lower($1))
      AND ($2::int IS NULL OR c.year IS NULL OR c.year >= $2)
    ORDER BY c.id ASC
    LIMIT $3 OFFSET $4
    `,
    args
  );
  return rows;
}

async function insertCandidate(row) {
  const {
    src_url,
    source,
    source_url,
    license = null,
    credit = null,
    width = null,
    height = null,
    sha256: s256,
    phash,
    sport = null,
    year = null,
    set_name = null,
    number = null,
    player = null,
    matched_card_id = null,
    match_score = null,
    cf_image_id = null,
  } = row;

  const { rows } = await pool.query(
    `
    INSERT INTO sc_image_candidates
      (src_url, source, source_url, license, credit, width, height, sha256, phash,
       sport, year, set_name, number, player, matched_card_id, match_score, cf_image_id)
    VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,
       $10,$11,$12,$13,$14,$15,$16,$17)
    ON CONFLICT (sha256) DO UPDATE
      SET updated_at = now()
    RETURNING id
    `,
    [
      src_url,
      source,
      source_url,
      license,
      credit,
      width,
      height,
      s256,
      phash,
      sport,
      year,
      set_name,
      number,
      player,
      matched_card_id,
      match_score,
      cf_image_id,
    ]
  );
  return rows?.[0]?.id ?? null;
}

async function promoteToImages({ card_id, src_url, sha256Hex, phashHex, width, height, cf_image_id }) {
  const { rows } = await pool.query(
    `
    INSERT INTO sc_images
      (card_id, src_url, license, credit, width, height, sha256, phash, is_primary, cf_image_id)
    VALUES ($1,$2,NULL,NULL,$3,$4,$5,$6,TRUE,$7)
    ON CONFLICT (sha256) DO NOTHING
    RETURNING id
    `,
    [card_id, src_url, width, height, sha256Hex, phashHex, cf_image_id]
  );
  return rows?.[0]?.id ?? null;
}

// -------------------- Query builders --------------------
function makeQ(card) {
  // ex: "2018 Prizm LeBron James #128 basketball"
  return `${card.year ?? ''} ${card.set_name ?? ''} ${card.player ?? ''} #${card.number ?? ''} ${card.sport ?? ''}`
    .replace(/\s+/g, ' ')
    .trim();
}

// -------------------- eBay Browse API (Option B) --------------------
const EBAY_ENV = (process.env.EBAY_ENV || 'PROD').toUpperCase();
const EBAY_CLIENT_ID = process.env.EBAY_CLIENT_ID || '';
const EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET || '';
const EBAY_SCOPE = process.env.EBAY_SCOPE || 'https://api.ebay.com/oauth/api_scope';

let ebayTokenCache = { token: null, exp: 0 };

async function getEbayAccessToken() {
  if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET) return null;
  const now = Date.now();
  if (ebayTokenCache.token && now < ebayTokenCache.exp - 60_000) {
    return ebayTokenCache.token;
  }
  const base = EBAY_ENV === 'SANDBOX' ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';
  const auth = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: EBAY_SCOPE,
  });

  const res = await fetch(`${base}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!res.ok) {
    console.warn('eBay token error', res.status);
    return null;
  }
  const json = await res.json();
  ebayTokenCache = {
    token: json.access_token,
    exp: Date.now() + (json.expires_in || 7200) * 1000,
  };
  return ebayTokenCache.token;
}

// eBay Browse: /buy/browse/v1/item_summary/search
async function* searchEbayBrowseApi(card) {
  const token = await getEbayAccessToken();
  if (!token) return;

  const base = EBAY_ENV === 'SANDBOX' ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';
  const q = makeQ(card);
  const url = new URL(`${base}/buy/browse/v1/item_summary/search`);
  url.searchParams.set('q', q);
  url.searchParams.set('limit', '24'); // tune as needed

  await perHostDelay(url.toString());
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'User-Agent': UA,
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
    },
  });
  if (!res.ok) return;
  const data = await res.json();
  const arr = data?.itemSummaries || [];
  for (const it of arr) {
    const imageUrl =
      it?.image?.imageUrl ||
      (Array.isArray(it?.thumbnailImages) && it.thumbnailImages[0]?.imageUrl) ||
      null;
    const pageUrl = it?.itemWebUrl || null;
    if (!imageUrl) continue;
    yield { imageUrl, sourceUrl: pageUrl, source: 'ebay-browse' };
  }
}

// -------------------- Adapters (HTML fallbacks) --------------------

// TCDB (TradingCardDB) HTML search
async function* searchTcdb(card) {
  const q = makeQ(card);
  const url = `https://www.tcdb.com/Search.cfm?sc=cards&ReqName=${encodeURIComponent(q)}&PageIndex=1`;
  let html = '';
  try {
    html = await fetchHtml(url);
  } catch (e) {
    console.warn('[tcdb] fetch error', e.message);
    return;
  }
  const $ = cheerio.load(html);
  // Grab result thumbs. TCDB HTML varies; be permissive:
  const imgs = $('img').toArray().slice(0, 50);
  for (const n of imgs) {
    const src = $(n).attr('src') || $(n).attr('data-src') || '';
    const alt = ($(n).attr('alt') || '').toLowerCase();
    if (!src) continue;
    // Prefer TCDB image hosts
    if (!/tcdb\.com|images\.tcdb\.com|tradingcarddb\.com/i.test(src)) continue;
    // Basic quality heuristic
    if (alt.includes('back') || alt.includes('logo')) continue;
    yield { imageUrl: new URL(src, url).toString(), sourceUrl: url };
  }
}

// eBay HTML search (fallback)
async function* searchEbay(card) {
  const q = makeQ(card);
  const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&LH_Sold=1&LH_Complete=1`;
  let html = '';
  try {
    html = await fetchHtml(url);
  } catch (e) {
    console.warn('[ebay] fetch error', e.message);
    return;
  }
  const $ = cheerio.load(html);
  const items = $('li.s-item').toArray().slice(0, 40);
  for (const li of items) {
    const a = $(li).find('a.s-item__link').attr('href');
    const img =
      $(li).find('img.s-item__image-img').attr('src') ||
      $(li).find('img.s-item__image-img').attr('data-src');
    if (!img) continue;
    // Prefer full-size if pattern matches
    let imageUrl = img.replace(/s-l\d{2,4}\.jpg/i, 's-l1600.jpg');
    try {
      new URL(imageUrl);
    } catch {
      imageUrl = img;
    }
    yield { imageUrl, sourceUrl: a || url };
  }
}

// COMC HTML search
async function* searchComc(card) {
  const q = makeQ(card);
  const url = `https://www.comc.com/search?searchTerm=${encodeURIComponent(q)}&sort=priceHighToLow`;
  let html = '';
  try {
    html = await fetchHtml(url);
  } catch (e) {
    console.warn('[comc] fetch error', e.message);
    return;
  }
  const $ = cheerio.load(html);
  // COMC uses various lazy attrs; gather generously
  const imgs = $('img').toArray().slice(0, 60);
  for (const n of imgs) {
    const raw = $(n).attr('data-src') || $(n).attr('src') || '';
    if (!raw) continue;
    if (!/comc\.com|product-images\.comc\.com/i.test(raw)) continue;
    // avoid banners/logos
    const alt = ($(n).attr('alt') || '').toLowerCase();
    if (alt.includes('logo') || alt.includes('comc')) continue;
    yield { imageUrl: new URL(raw, url).toString(), sourceUrl: url };
  }
}

// -------------------- Central dispatcher --------------------
async function* generateCandidates(card) {
  for (const src of SOURCE_ORDER) {
    try {
      if (src === 'tcdb') {
        for await (const r of searchTcdb(card)) yield { ...r, source: 'tcdb' };
      } else if (src === 'ebayBrowse') {
        for await (const r of searchEbayBrowseApi(card)) yield r; // already sets source
      } else if (src === 'comc') {
        for await (const r of searchComc(card)) yield { ...r, source: 'comc' };
      } else if (src === 'ebay') {
        for await (const r of searchEbay(card)) yield { ...r, source: 'ebay' };
      }
    } catch (e) {
      console.warn(`[${src}] adapter error`, e.message);
    }
  }
}

// -------------------- Main pipeline --------------------
async function processOneCard(card, { autoPromote = false } = {}) {
  console.log(
    `\n[card] ${card.id} :: ${card.year ?? ''} ${card.set_name ?? ''} ${card.player ?? ''} #${card.number ?? ''}`
  );

  for await (const cand of generateCandidates(card)) {
    const candidateWithMeta = {
      ...cand,
      sport: card.sport,
      year: card.year,
      set_name: card.set_name,
      number: card.number,
      player: card.player,
    };

    // Score
    const score = scoreMatch(card, candidateWithMeta);
    if (score < 50) continue;

    // Download
    let buf;
    try {
      ({ buf } = await downloadImage(candidateWithMeta.imageUrl));
    } catch (e) {
      console.warn('download error:', e.message);
      continue;
    }

    // Hash/meta
    let s256 = '',
      phash = '',
      wh = { width: null, height: null };
    try {
      s256 = sha256(buf);
      phash = await computePhash(buf);
      wh = await getImageMeta(buf);
    } catch (e) {
      console.warn('hash/meta error:', e.message);
      continue;
    }

    // Optional Cloudflare upload
    let cf_image_id = null;
    try {
      cf_image_id = await cfImagesUpload(buf);
      if (cf_image_id) {
        const cfUrl = cfPublicUrl(cf_image_id, 'card');
        if (cfUrl) {
          candidateWithMeta.imageUrl = cfUrl; // prefer durable URL
        }
      }
    } catch (e) {
      console.warn('CF upload failed:', e.message);
    }

    // Persist candidate
    const candId = await insertCandidate({
      src_url: candidateWithMeta.imageUrl,
      source: cand.source,
      source_url: candidateWithMeta.sourceUrl,
      license: null,
      credit: null,
      width: wh.width,
      height: wh.height,
      sha256: s256,
      phash,
      sport: card.sport,
      year: card.year,
      set_name: card.set_name,
      number: card.number,
      player: card.player,
      matched_card_id: card.id,
      match_score: score,
      cf_image_id,
    });

    console.log(
      `  [+] candidate #${candId} ${cand.source} score=${score} wh=${wh.width}x${wh.height}`
    );

    // Auto promote to sc_images
    if (autoPromote && score >= AUTO_PROMOTE_MIN) {
      const imgId = await promoteToImages({
        card_id: card.id,
        src_url: candidateWithMeta.imageUrl,
        sha256Hex: s256,
        phashHex: phash,
        width: wh.width,
        height: wh.height,
        cf_image_id,
      });
      if (imgId) {
        console.log(`  [✓] promoted to sc_images id=${imgId}`);
        return true; // stop after first good primary
      }
    }
  }

  return false;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { limit: 200, since: null, sport: null, autoPromote: false, all: false };
  for (const a of args) {
    if (a.startsWith('--limit=')) out.limit = Number(a.split('=')[1] || 200);
    if (a.startsWith('--since=')) out.since = Number(a.split('=')[1] || 0);
    if (a.startsWith('--sport=')) out.sport = a.split('=')[1] || null;
    if (a === '--auto-promote') out.autoPromote = true;
    if (a === '--all') out.all = true; // NEW: full-table sweep
  }
  return out;
}

async function main() {
  const { limit, since, sport, autoPromote, all } = parseArgs();
  console.log('Starting harvester (no-SerpAPI + eBay Browse):', {
    mode: all ? 'ALL (batched)' : `LIMIT=${limit}`,
    since,
    sport,
    autoPromote,
    CONCURRENCY,
    BATCH_SIZE,
  });

  const limitFn = pLimit(CONCURRENCY);
  let promotedTotal = 0;
  let attemptedTotal = 0;

  if (all) {
    // Sweep the entire sc_cards table in ascending id order.
    let offset = 0;
    for (;;) {
      const batch = await pickCardsAll({ offset, batchSize: BATCH_SIZE, sport, sinceYear: since });
      if (batch.length === 0) break;

      console.log(`\nBatch offset=${offset} count=${batch.length}`);

      await Promise.all(
        batch.map((card) =>
          limitFn(async () => {
            try {
              // Skip cards that already have at least one image
              if (card.has_image) return;
              attemptedTotal += 1;
              const ok = await processOneCard(card, { autoPromote });
              if (ok) promotedTotal += 1;
            } catch (e) {
              console.warn('card error', card.id, e.message);
            }
          })
        )
      );

      offset += batch.length; // move window forward
    }
  } else {
    // Original behavior: one pull of "needing images"
    const cards = await pickCardsNeedingImages({ limit, sinceYear: since, sport });
    console.log(`Found ${cards.length} cards to process`);

    await Promise.all(
      cards.map((card) =>
        limitFn(async () => {
          try {
            attemptedTotal += 1;
            const ok = await processOneCard(card, { autoPromote });
            if (ok) promotedTotal += 1;
          } catch (e) {
            console.warn('card error', card.id, e.message);
          }
        })
      )
    );
  }

  console.log(`\nDone. Attempted: ${attemptedTotal}. Auto-promoted: ${promotedTotal}.`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
