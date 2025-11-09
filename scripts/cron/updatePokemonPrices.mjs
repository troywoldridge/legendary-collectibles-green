/* eslint-disable no-console */
import 'dotenv/config';
import { Pool } from 'pg';
import { request } from 'undici';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const KEY = process.env.POKEMONTCG_API_KEY;

function toNum(x) { if (x == null) return null; const n = Number(x); return Number.isFinite(n) ? n : null; }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function hasColumn(table, col) {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
    [table, col]
  );
  return rows.length > 0;
}

async function bootstrap() {
  // Create tables if they don't exist (with canonical snake_case)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tcg_card_prices_tcgplayer (
      card_id text PRIMARY KEY,
      market_normal numeric,
      market_holofoil numeric,
      market_reverse_holofoil numeric,
      market_1st_normal numeric,
      market_1st_holofoil numeric,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS tcg_card_prices_cardmarket (
      card_id text PRIMARY KEY,
      avg1 numeric,
      avg7 numeric,
      avg30 numeric,
      trend numeric,
      low numeric,
      low_ex numeric,
      reverse_holo_low numeric,
      reverse_holo_trend numeric,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  // If an older schema used "cardid", rename it to "card_id"
  if (await hasColumn('tcg_card_prices_tcgplayer', 'cardid') && !(await hasColumn('tcg_card_prices_tcgplayer', 'card_id'))) {
    console.log('Renaming tcg_card_prices_tcgplayer.cardid -> card_id');
    await pool.query(`ALTER TABLE tcg_card_prices_tcgplayer RENAME COLUMN cardid TO card_id`);
  }
  if (await hasColumn('tcg_card_prices_cardmarket', 'cardid') && !(await hasColumn('tcg_card_prices_cardmarket', 'card_id'))) {
    console.log('Renaming tcg_card_prices_cardmarket.cardid -> card_id');
    await pool.query(`ALTER TABLE tcg_card_prices_cardmarket RENAME COLUMN cardid TO card_id`);
  }

  // Ensure new columns exist (if tables were created long ago)
  await pool.query(`
    ALTER TABLE tcg_card_prices_tcgplayer
      ADD COLUMN IF NOT EXISTS market_normal numeric,
      ADD COLUMN IF NOT EXISTS market_holofoil numeric,
      ADD COLUMN IF NOT EXISTS market_reverse_holofoil numeric,
      ADD COLUMN IF NOT EXISTS market_1st_normal numeric,
      ADD COLUMN IF NOT EXISTS market_1st_holofoil numeric,
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

    ALTER TABLE tcg_card_prices_cardmarket
      ADD COLUMN IF NOT EXISTS avg1 numeric,
      ADD COLUMN IF NOT EXISTS avg7 numeric,
      ADD COLUMN IF NOT EXISTS avg30 numeric,
      ADD COLUMN IF NOT EXISTS trend numeric,
      ADD COLUMN IF NOT EXISTS low numeric,
      ADD COLUMN IF NOT EXISTS low_ex numeric,
      ADD COLUMN IF NOT EXISTS reverse_holo_low numeric,
      ADD COLUMN IF NOT EXISTS reverse_holo_trend numeric,
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

    CREATE INDEX IF NOT EXISTS tcg_prices_tcgplayer_updated_idx ON tcg_card_prices_tcgplayer(updated_at);
    CREATE INDEX IF NOT EXISTS tcg_prices_cardmarket_updated_idx ON tcg_card_prices_cardmarket(updated_at);
  `);
}

async function pageCards(page) {
  const url = `https://api.pokemontcg.io/v2/cards?page=${page}&pageSize=250&orderBy=id`;
  const res = await request(url, { method: 'GET', headers: { 'X-Api-Key': KEY } });
  if (res.statusCode >= 500) throw new Error(`HTTP ${res.statusCode}`);
  if (res.statusCode === 429) throw new Error('Rate limited');
  if (res.statusCode !== 200) throw new Error(`HTTP ${res.statusCode}`);
  return res.body.json();
}

const UPSERT_TCGPLAYER = `
INSERT INTO tcg_card_prices_tcgplayer
  (card_id, market_normal, market_holofoil, market_reverse_holofoil, market_1st_normal, market_1st_holofoil, updated_at)
VALUES
  ($1,$2,$3,$4,$5,$6, now())
ON CONFLICT (card_id) DO UPDATE SET
  market_normal = EXCLUDED.market_normal,
  market_holofoil = EXCLUDED.market_holofoil,
  market_reverse_holofoil = EXCLUDED.market_reverse_holofoil,
  market_1st_normal = EXCLUDED.market_1st_normal,
  market_1st_holofoil = EXCLUDED.market_1st_holofoil,
  updated_at = now();
`;

const UPSERT_CARDMARKET = `
INSERT INTO tcg_card_prices_cardmarket
  (card_id, avg1, avg7, avg30, trend, low, low_ex, reverse_holo_low, reverse_holo_trend, updated_at)
VALUES
  ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
ON CONFLICT (card_id) DO UPDATE SET
  avg1 = EXCLUDED.avg1,
  avg7 = EXCLUDED.avg7,
  avg30 = EXCLUDED.avg30,
  trend = EXCLUDED.trend,
  low = EXCLUDED.low,
  low_ex = EXCLUDED.low_ex,
  reverse_holo_low = EXCLUDED.reverse_holo_low,
  reverse_holo_trend = EXCLUDED.reverse_holo_trend,
  updated_at = now();
`;

async function main() {
  if (!KEY) console.warn('POKEMONTCG_API_KEY is not set — request may be rejected');
  console.log('Pokémon prices — start');

  await bootstrap();

  let page = 1;
  let total = 0;
  let pages = 1;

  while (page <= pages) {
    try {
      const body = await pageCards(page);
      total = body.totalCount ?? total;
      pages = Math.max(pages, Math.ceil((total || 0) / 250));
      const cards = body.data ?? [];

      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        for (const card of cards) {
          const id = card.id;

          // TCGplayer
          const tp = card.tcgplayer?.prices ?? {};
          await c.query(UPSERT_TCGPLAYER, [
            id,
            toNum(tp.normal?.market),
            toNum(tp.holofoil?.market),
            toNum(tp.reverseHolofoil?.market),
            toNum(tp.firstEditionNormal?.market),
            toNum(tp.firstEditionHolofoil?.market),
          ]);

          // Cardmarket
          const cm = card.cardmarket?.prices ?? {};
          await c.query(UPSERT_CARDMARKET, [
            id,
            toNum(cm.averageSellPrice),
            toNum(cm.avg7),
            toNum(cm.avg30),
            toNum(cm.trendPrice),
            toNum(cm.lowPrice),
            toNum(cm.lowPriceExPlus),
            toNum(cm.reverseHoloLow),
            toNum(cm.reverseHoloTrend),
          ]);
        }
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }

      console.log(`Page ${page}/${pages} — upserted ${cards.length}`);
      page++;
      await sleep(200); // be polite
    } catch (e) {
      console.warn(`Page ${page} failed (${e.message}). Retrying after backoff…`);
      await sleep(1000);
    }
  }

  console.log('Pokémon prices — done');
  await pool.end();
}

main().catch((e) => {
  console.error('Failed:', e);
  process.exit(1);
});
