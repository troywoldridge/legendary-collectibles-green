/* eslint-disable no-console */
import 'dotenv/config';
import { request } from 'undici';
import { Pool } from 'pg';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mkdirSync, rmSync, existsSync } from 'node:fs';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SQL_BOOTSTRAP = `
CREATE TABLE IF NOT EXISTS mtg_prices_scryfall (
  scryfall_id uuid PRIMARY KEY,
  set_code text,
  collector_number text,
  usd numeric,
  usd_foil numeric,
  usd_etched numeric,
  eur numeric,
  tix numeric,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mtg_prices_scryfall_setnum_idx
  ON mtg_prices_scryfall (set_code, collector_number);
`;

const UPSERT_SQL = `
INSERT INTO mtg_prices_scryfall
  (scryfall_id, set_code, collector_number, usd, usd_foil, usd_etched, eur, tix, updated_at)
VALUES
  ($1,$2,$3,$4,$5,$6,$7,$8, now())
ON CONFLICT (scryfall_id) DO UPDATE SET
  set_code = EXCLUDED.set_code,
  collector_number = EXCLUDED.collector_number,
  usd = EXCLUDED.usd,
  usd_foil = EXCLUDED.usd_foil,
  usd_etched = EXCLUDED.usd_etched,
  eur = EXCLUDED.eur,
  tix = EXCLUDED.tix,
  updated_at = now();
`;

function ua() {
  return 'legendary-collectibles/1.0 (prices updater; contact: admin@legendary-collectibles.com)';
}

async function fetchJson(url) {
  const res = await request(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json', 'User-Agent': ua() },
  });
  const text = await res.body.text();
  if (res.statusCode !== 200) {
    throw new Error(`${url} → HTTP ${res.statusCode} ${text.slice(0, 180)}`);
  }
  return JSON.parse(text);
}

async function getDefaultCardsDownloadUri() {
  // Try the direct record first (usually more reliable)
  try {
    const body = await fetchJson('https://api.scryfall.com/bulk-data/default_cards');
    if (body?.download_uri) return body.download_uri;
  } catch (e) {
    console.warn('Direct /bulk-data/default_cards failed:', e.message);
  }
  // Fallback to the index
  const body = await fetchJson('https://api.scryfall.com/bulk-data');
  const entry = body.data?.find((x) => x.type === 'default_cards');
  if (!entry?.download_uri) throw new Error('default_cards not found in bulk index');
  return entry.download_uri;
}

function toNum(x) {
  if (x == null) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  console.log('MTG prices — start');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(SQL_BOOTSTRAP);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  const uri = await getDefaultCardsDownloadUri();
  console.log('Download:', uri);

  const dir = path.join(tmpdir(), 'scryfall');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'default_cards.json');

  const dl = await request(uri, { method: 'GET', headers: { 'User-Agent': ua() } });
  if (dl.statusCode !== 200) throw new Error(`download ${dl.statusCode}`);
  await pipeline(dl.body, createWriteStream(file));
  console.log('Downloaded file:', file);

  const text = await (await import('node:fs/promises')).readFile(file, 'utf8');
  const data = JSON.parse(text);
  console.log(`Processing ${data.length.toLocaleString()} cards…`);

  const CHUNK = 5000;
  for (let i = 0; i < data.length; i += CHUNK) {
    const slice = data.slice(i, i + CHUNK);
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      for (const card of slice) {
        const scryfallId = card.id;
        const set = card.set ?? null;
        const num = card.collector_number ?? null;
        const p = card.prices ?? {};
        await c.query(UPSERT_SQL, [
          scryfallId,
          set,
          num,
          toNum(p.usd),
          toNum(p.usd_foil),
          toNum(p.usd_etched),
          toNum(p.eur),
          toNum(p.tix),
        ]);
      }
      await c.query('COMMIT');
      console.log(`Upserted ${Math.min(CHUNK, slice.length)} (${i + slice.length}/${data.length})`);
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }

  try { rmSync(file, { force: true }); } catch {}
  console.log('MTG prices — done');
}

// at the very end of scripts/cron/updateMtgPrices.scryfall.mjs
try {
  await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mtg_prices_effective;');
  console.log('Refreshed mtg_prices_effective');
} catch (e) {
  console.warn('Could not refresh mtg_prices_effective:', e.message);
}


main().catch((e) => {
  console.error('Failed:', e);
  process.exit(1);
});
