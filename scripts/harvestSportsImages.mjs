/* eslint-disable no-console */
// Node 20+
// Deps:
//   pnpm add pg p-limit sharp imghash
//
// Optional (SerpApi):
//   pnpm add node-fetch@^3 (NOT required on Node 20+)
//   # You do NOT need the serpapi npm pkg; we call their REST API via fetch.
//
// ENV (.env):
//   DATABASE_URL=postgres://user:pass@host:5432/db
//   SERPAPI_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx   # optional but recommended
//   # Optional Cloudflare Images (uploads):
//   CF_ACCOUNT_ID=...
//   CF_IMAGES_TOKEN=...
//   CF_ACCOUNT_HASH=...
//
// Run examples:
//   node scripts/harvestSportsImages.mjs --all --sport=basketball --since=2010 --auto-promote --promote-max=2
//   node scripts/harvestSportsImages.mjs --limit=300 --since=1900 --sport=baseball --auto-promote
//   HARVEST_BATCH_SIZE=500 HARVEST_CONCURRENCY=4 node scripts/harvestSportsImages.mjs --all

import 'dotenv/config';
import { Pool } from 'pg';
import pLimit from 'p-limit';
import sharp from 'sharp';
import imghash from 'imghash';

const {
  DATABASE_URL,
  SERPAPI_KEY,
  CF_ACCOUNT_ID,
  CF_IMAGES_TOKEN,
  CF_ACCOUNT_HASH,
} = process.env;

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

// -------------------- Tunables --------------------
const CONCURRENCY = Number(process.env.HARVEST_CONCURRENCY ?? 4);
const PER_HOST_DELAY_MS = Number(process.env.HARVEST_PER_HOST_DELAY_MS ?? 700);
const MAX_BYTES = 12 * 1024 * 1024; // 12MB cap
const ACCEPT_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MIN_WIDTH = Number(process.env.MIN_WIDTH ?? 180);
const MIN_HEIGHT = Number(process.env.MIN_HEIGHT ?? 240);
const DEFAULT_SCORE_GATE = Number(process.env.SCORE_GATE ?? 50);
const DEFAULT_AUTO_PROMOTE_MIN = Number(process.env.AUTO_PROMOTE_MIN ?? 88);
const HARVEST_BATCH_SIZE = Number(process.env.HARVEST_BATCH_SIZE ?? 300);

const UA =
  'LegendaryCollectiblesBot/1.0 (+https://legendary-collectibles.com; polite; contact admin)';

// Site-priorities for SerpApi queries
const SOURCE_ORDER = ['tcdb', 'comc', 'ebay', 'beckett', 'psa', 'sgc', 'scp'];

// -------------------- Helpers --------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const perHostTimers = new Map();
async function perHostDelay(url) {
  try {
    const host = new URL(url).host;
    const last = perHostTimers.get(host) ?? 0;
    const now = Date.now();
    const wait = PER_HOST_DELAY_MS - (now - last);
    if (wait > 0) await sleep(wait);
    perHostTimers.set(host, Date.now());
  } catch {}
}

function sha256(buf) {
  // use Web Crypto subtle? node:crypto also fine; sharp pipeline needs buffer anyway
  // kept simple by using built-in Web Crypto on Node 20+
  return require('node:crypto').createHash('sha256').update(buf).digest('hex');
}

async function computePhash(buf) {
  const png = await sharp(buf).ensureAlpha().png().toBuffer();
  return imghash.hash(png, 16, 'hex'); // 16x16 perceptual hash
}

async function getImageMeta(buf) {
  const m = await sharp(buf).metadata();
  return {
    width: m.width ?? null,
    height: m.height ?? null,
  };
}

function okDims(w, h) {
  if (!w || !h) return false;
  return w >= MIN_WIDTH && h >= MIN_HEIGHT;
}

// Scoring heuristic for sports
function scoreMatch(card, candidate) {
  // 0 .. 100
  let s = 0;

  // strong: number exact
  if (
    card.number &&
    candidate.number &&
    String(card.number).toLowerCase() === String(candidate.number).toLowerCase()
  )
    s += 30;

  // sport exact
  if (card.sport && candidate.sport && card.sport.toLowerCase() === candidate.sport.toLowerCase())
    s += 18;

  // year exact
  if (card.year && candidate.year && Number(card.year) === Number(candidate.year)) s += 16;

  // set fuzzy
  if (card.set_name && candidate.set_name) {
    const a = card.set_name.toLowerCase();
    const b = candidate.set_name.toLowerCase();
    if (a === b) s += 18;
    else if (a.includes(b) || b.includes(a)) s += 12;
  }

  // player contains
  if (card.player && candidate.player) {
    const a = card.player.toLowerCase();
    const b = candidate.player.toLowerCase();
    if (a === b) s += 14;
    else if (a.includes(b) || b.includes(a)) s += 8;
  }

  if (s < 20 && (candidate.number || candidate.player) && (candidate.set_name || candidate.year)) s += 8;

  return Math.min(100, s);
}

async function downloadImage(url) {
  await perHostDelay(url);
  const res = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'User-Agent': UA,
      Accept: [...ACCEPT_MIME].join(','),
      'Accept-Language': 'en-US,en;q=0.8',
      Referer: new URL(url).origin,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const ct = res.headers.get('content-type') || '';
  if (![...ACCEPT_MIME].some((m) => ct.includes(m))) {
    throw new Error(`Unsupported content-type ${ct}`);
  }
  // stream with size cap
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

async function cfImagesUpload(buf) {
  if (!CF_ACCOUNT_ID || !CF_IMAGES_TOKEN) return null;
  await sleep(250);
  const form = new FormData();
  form.append('file', new Blob([buf]), 'card-image');
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/images/v1`,
    { method: 'POST', headers: { Authorization: `Bearer ${CF_IMAGES_TOKEN}` }, body: form }
  );
  const j = await res.json();
  if (!j?.success) {
    console.warn('CF Images upload failed', j?.errors || j);
    return null;
  }
  return j?.result?.id ?? null;
}

function cfPublicUrl(cfImageId, variant = 'card') {
  if (!CF_ACCOUNT_HASH || !cfImageId) return null;
  return `https://imagedelivery.net/${CF_ACCOUNT_HASH}/${cfImageId}/${variant}`;
}

// -------------------- DB bootstrap (idempotent) --------------------
async function ensureSchema() {
  await pool.query(`
    -- candidates
    CREATE TABLE IF NOT EXISTS sc_image_candidates (
      id BIGSERIAL PRIMARY KEY,
      src_url TEXT NOT NULL,
      source TEXT,
      source_url TEXT,
      license TEXT,
      credit TEXT,
      width INT,
      height INT,
      sha256 TEXT NOT NULL,
      phash TEXT,
      sport TEXT,
      year INT,
      set_name TEXT,
      number TEXT,
      player TEXT,
      matched_card_id TEXT,            -- legacy: first discoverer
      match_score INT,
      cf_image_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS sc_image_candidates_sha256_key
      ON sc_image_candidates (sha256);

    -- links (candidate ↔ card)
    CREATE TABLE IF NOT EXISTS sc_image_candidate_links (
      candidate_id BIGINT NOT NULL REFERENCES sc_image_candidates(id) ON DELETE CASCADE,
      card_id TEXT NOT NULL REFERENCES sc_cards(id) ON DELETE CASCADE,
      match_score INT NOT NULL DEFAULT 0,
      source TEXT,
      source_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (candidate_id, card_id)
    );

    CREATE INDEX IF NOT EXISTS sc_image_candidate_links_card_score_idx
      ON sc_image_candidate_links (card_id, match_score DESC, candidate_id);

    -- images (final gallery)
    CREATE TABLE IF NOT EXISTS sc_images (
      id BIGSERIAL PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES sc_cards(id) ON DELETE CASCADE,
      src_url TEXT,
      license TEXT,
      credit TEXT,
      width INT,
      height INT,
      sha256 TEXT NOT NULL,
      phash TEXT,
      is_primary BOOLEAN NOT NULL DEFAULT FALSE,
      cf_image_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS sc_images_sha256_key ON sc_images (sha256);
    CREATE INDEX IF NOT EXISTS sc_images_card_idx ON sc_images (card_id);
  `);

  // backfill links from legacy matched_card_id (one-time safe)
  await pool.query(`
    INSERT INTO sc_image_candidate_links (candidate_id, card_id, match_score, source, source_url, created_at)
    SELECT c.id, c.matched_card_id, COALESCE(c.match_score,0), c.source, c.source_url, COALESCE(c.created_at, now())
    FROM sc_image_candidates c
    WHERE c.matched_card_id IS NOT NULL
    ON CONFLICT DO NOTHING
  `);
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
       sport, year, set_name, number, player, matched_card_id, match_score, cf_image_id, created_at, updated_at)
    VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,
       $10,$11,$12,$13,$14,$15,$16,$17, now(), now())
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

async function linkCandidateToCard({ candidateId, cardId, score, source, sourceUrl }) {
  await pool.query(
    `
      INSERT INTO sc_image_candidate_links (candidate_id, card_id, match_score, source, source_url)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (candidate_id, card_id) DO UPDATE
        SET match_score = GREATEST(sc_image_candidate_links.match_score, EXCLUDED.match_score),
            source = COALESCE(EXCLUDED.source, sc_image_candidate_links.source),
            source_url = COALESCE(EXCLUDED.source_url, sc_image_candidate_links.source_url)
    `,
    [candidateId, cardId, score ?? 0, source ?? null, sourceUrl ?? null]
  );
}

async function insertImage({ card_id, src_url, sha256Hex, phashHex, width, height, cf_image_id, is_primary }) {
  const { rows } = await pool.query(
    `
    INSERT INTO sc_images
      (card_id, src_url, license, credit, width, height, sha256, phash, is_primary, cf_image_id, created_at)
    VALUES ($1,$2,NULL,NULL,$3,$4,$5,$6,$7,$8, now())
    ON CONFLICT (sha256) DO NOTHING
    RETURNING id
    `,
    [card_id, src_url, width, height, sha256Hex, phashHex, !!is_primary, cf_image_id]
  );
  return rows?.[0]?.id ?? null;
}

// -------------------- SerpApi adapter --------------------
function buildQueries(card) {
  // keep the query simple and consistent
  const base = `${card.year ?? ''} ${card.set_name ?? ''} ${card.player ?? ''} #${card.number ?? ''}`
    .replace(/\s+/g, ' ')
    .trim();

  return {
    tcdb: [
      `${base} site:tradingcarddb.com`,
      `${card.set_name ?? ''} ${card.player ?? ''} site:tradingcarddb.com`,
    ],
    comc: [
      `${base} site:comc.com`,
    ],
    ebay: [
      `${base} site:ebay.com`,
      `${base} site:ebayimg.com`,
    ],
    beckett: [
      `${base} site:beckett.com`,
    ],
    psa: [
      `${base} site:psacard.com`,
    ],
    sgc: [
      `${base} site:sgcgrading.com OR site:gosgc.com`,
    ],
    scp: [
      `${base} site:sportscardspro.com`,
    ],
  };
}

async function serpImages(q, { num = 8 } = {}) {
  if (!SERPAPI_KEY) return [];
  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google_images');
  url.searchParams.set('q', q);
  url.searchParams.set('num', String(num));
  url.searchParams.set('safe', 'off');
  url.searchParams.set('api_key', SERPAPI_KEY);

  await perHostDelay(url.toString());
  const res = await fetch(url);
  if (!res.ok) return [];
  const j = await res.json();
  const arr = j?.images_results || [];
  return arr
    .map((it) => ({
      imageUrl: it?.original || it?.image || it?.thumbnail || null,
      sourceUrl: it?.link || it?.source || null,
    }))
    .filter((x) => x.imageUrl);
}

async function* generateCandidates(card) {
  const queries = buildQueries(card);
  for (const src of SOURCE_ORDER) {
    const qs = queries[src] || [];
    for (const q of qs) {
      let results = [];
      try {
        results = await serpImages(q, { num: 10 });
      } catch (e) {
        console.warn(`[${src}] serp error`, e.message);
      }
      for (const r of results) {
        const imageUrl = r.imageUrl;
        if (!imageUrl) continue;
        yield {
          src_url: imageUrl,
          source: src,
          source_url: r.sourceUrl ?? null,
        };
      }
    }
  }
}

// -------------------- Main per-card pipeline --------------------
async function processOneCard(card, { scoreGate = DEFAULT_SCORE_GATE, autoPromote = false, autoPromoteMin = DEFAULT_AUTO_PROMOTE_MIN, promoteMax = 1 } = {}) {
  console.log(`\n[card] ${card.id} :: ${card.year ?? ''} ${card.set_name ?? ''} ${card.player ?? ''} #${card.number ?? ''}`);

  const accepted = []; // gather candidates and pick best N at the end

  for await (const cand of generateCandidates(card)) {
    const candidateWithMeta = {
      ...cand,
      sport: card.sport,
      year: card.year,
      set_name: card.set_name,
      number: card.number,
      player: card.player,
    };

    const score = scoreMatch(card, candidateWithMeta);
    if (score < scoreGate) continue;

    // Download
    let buf;
    try {
      ({ buf } = await downloadImage(candidateWithMeta.src_url));
    } catch (e) {
      console.warn('download error:', e.message);
      continue;
    }

    // Hash & meta
    let s256 = '', phash = '', dims = { width: null, height: null };
    try {
      s256 = sha256(buf);
      phash = await computePhash(buf);
      dims = await getImageMeta(buf);
      if (!okDims(dims.width, dims.height)) {
        // keep a record but skip promotion quality
        // still insert candidate/link
      }
    } catch (e) {
      console.warn('hash/meta error:', e.message);
      continue;
    }

    // Optional CF upload
    let cf_image_id = null;
    try {
      cf_image_id = await cfImagesUpload(buf);
      if (cf_image_id) {
        const cfUrl = cfPublicUrl(cf_image_id, 'card');
        if (cfUrl) candidateWithMeta.src_url = cfUrl;
      }
    } catch (e) {
      console.warn('CF upload failed:', e.message);
    }

    // Persist candidate (dedup by sha256)
    const candId = await insertCandidate({
      ...candidateWithMeta,
      license: null,
      credit: null,
      width: dims.width,
      height: dims.height,
      sha256: s256,
      phash,
      matched_card_id: card.id,
      match_score: score,
      cf_image_id,
    });

    // Link candidate to this card (many-to-many)
    await linkCandidateToCard({
      candidateId: candId,
      cardId: card.id,
      score,
      source: candidateWithMeta.source,
      sourceUrl: candidateWithMeta.source_url,
    });

    console.log(`  [+] candidate #${candId} ${candidateWithMeta.source} score=${score} wh=${dims.width}x${dims.height}`);

    accepted.push({
      candId,
      score,
      width: dims.width ?? 0,
      height: dims.height ?? 0,
      src_url: candidateWithMeta.src_url,
      sha256: s256,
      phash,
      cf_image_id,
    });
  }

  if (!autoPromote || accepted.length === 0) return false;

  // Sort best -> worst: score, width, height
  accepted.sort((a, b) => (b.score - a.score) || (b.width - a.width) || (b.height - a.height));
  const top = accepted.filter((x) => x.score >= autoPromoteMin && okDims(x.width, x.height));

  let promoted = 0;
  const seenSha = new Set();

  for (const item of top) {
    if (promoted >= promoteMax) break;
    if (seenSha.has(item.sha256)) continue;
    seenSha.add(item.sha256);

    const imageId = await insertImage({
      card_id: card.id,
      src_url: item.src_url,
      sha256Hex: item.sha256,
      phashHex: item.phash,
      width: item.width,
      height: item.height,
      cf_image_id: item.cf_image_id,
      is_primary: promoted === 0, // first becomes primary
    });
    if (imageId) {
      console.log(`  [✓] promoted to sc_images id=${imageId}${promoted === 0 ? ' (primary)' : ''}`);
      promoted += 1;
    }
  }

  return promoted > 0;
}

// -------------------- CLI + batch loop --------------------
function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    limit: HARVEST_BATCH_SIZE,
    since: null,
    sport: null,
    all: false,
    autoPromote: false,
    promoteMax: 1,
    scoreGate: DEFAULT_SCORE_GATE,
    autoPromoteMin: DEFAULT_AUTO_PROMOTE_MIN,
  };
  for (const a of args) {
    if (a === '--all') out.all = true;
    if (a === '--auto-promote') out.autoPromote = true;
    if (a.startsWith('--limit=')) out.limit = Number(a.split('=')[1] || HARVEST_BATCH_SIZE);
    if (a.startsWith('--since=')) out.since = Number(a.split('=')[1] || 0);
    if (a.startsWith('--sport=')) out.sport = a.split('=')[1] || null;
    if (a.startsWith('--promote-max=')) out.promoteMax = Number(a.split('=')[1] || 1);
    if (a.startsWith('--score-gate=')) out.scoreGate = Number(a.split('=')[1] || DEFAULT_SCORE_GATE);
    if (a.startsWith('--auto-promote-min=')) out.autoPromoteMin = Number(a.split('=')[1] || DEFAULT_AUTO_PROMOTE_MIN);
  }
  return out;
}

async function main() {
  const opts = parseArgs();
  console.log('Harvester config:', {
    batchSize: opts.limit,
    since: opts.since,
    sport: opts.sport,
    all: opts.all,
    autoPromote: opts.autoPromote,
    promoteMax: opts.promoteMax,
    scoreGate: opts.scoreGate,
    autoPromoteMin: opts.autoPromoteMin,
    CONCURRENCY,
    PER_HOST_DELAY_MS,
    MIN_WIDTH,
    MIN_HEIGHT,
    SERPAPI: !!SERPAPI_KEY,
    CF_IMAGES: !!CF_ACCOUNT_ID && !!CF_IMAGES_TOKEN && !!CF_ACCOUNT_HASH,
  });

  await ensureSchema();

  const limitFn = pLimit(CONCURRENCY);
  let totalPromoted = 0;
  let batches = 0;

  for (;;) {
    const cards = await pickCardsNeedingImages({ limit: opts.limit, sinceYear: opts.since, sport: opts.sport });
    if (!cards.length) {
      console.log('No more cards needing images. Done.');
      break;
    }
    console.log(`Batch #${++batches} — processing ${cards.length} cards`);

    let promotedThisBatch = 0;

    await Promise.all(
      cards.map((card) =>
        limitFn(async () => {
          try {
            const ok = await processOneCard(card, {
              scoreGate: opts.scoreGate,
              autoPromote: opts.autoPromote,
              autoPromoteMin: opts.autoPromoteMin,
              promoteMax: opts.promoteMax,
            });
            if (ok) promotedThisBatch += 1;
          } catch (e) {
            console.warn('card error', card.id, e.message);
          }
        })
      )
    );

    totalPromoted += promotedThisBatch;
    console.log(`Batch done. Promoted ${promotedThisBatch} cards. Total promoted so far: ${totalPromoted}.`);

    if (!opts.all) break; // single batch mode
    // loop continues until pickCardsNeedingImages returns 0
  }

  await pool.end();
  console.log(`All done. Total cards promoted: ${totalPromoted}.`);
}

main().catch(async (e) => {
  console.error(e);
  try { await pool.end(); } catch {}
  process.exit(1);
});
