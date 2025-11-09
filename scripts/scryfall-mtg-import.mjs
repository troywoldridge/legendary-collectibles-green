// scripts/scryfall-mtg-import.mjs
// Usage:
//   DATABASE_URL=postgres://... node scripts/scryfall-mtg-import.mjs cards --type=default_cards
//   DATABASE_URL=postgres://... node scripts/scryfall-mtg-import.mjs rulings
//   DATABASE_URL=postgres://... node scripts/scryfall-mtg-import.mjs foreign --type=all_cards
//   DATABASE_URL=postgres://... node scripts/scryfall-mtg-import.mjs cards --file=/path/to/default-cards-YYYYMMDDHHMMSS.json
//
// Notes:
// - --type: default_cards | oracle_cards | all_cards | rulings   (default for 'cards' is default_cards)
// - --file: import from a local JSON file instead of fetching
// - Batching tuned for Neon; adjust BATCH_SIZE / CONCURRENCY if needed.

import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import { Client } from "pg";
import pLimit from "p-limit";
import StreamArray from "stream-json/streamers/StreamArray.js";


const ARG = Object.fromEntries(
  process.argv.slice(2).flatMap((s) => {
    if (!s.startsWith("--")) return [];
    const [k, ...rest] = s.slice(2).split("=");
    return [[k, rest.join("=") || "true"]];
  })
);

const COMMAND = (process.argv[2] && !process.argv[2].startsWith("--"))
  ? process.argv[2]
  : "cards";

// Tuning
const BATCH_SIZE = Number(ARG.batch || 600);
const CONCURRENCY = Number(ARG.concurrency || 2);

// Source choice
const TYPE = ARG.type || (COMMAND === "rulings" ? "rulings" : "default_cards");
const LOCAL_FILE = ARG.file || null;

function toBool(v) { return v === true || v === "true" || v === 1 || v === "1"; }

async function getBulkDownload(kind) {
  const res = await fetch("https://api.scryfall.com/bulk-data", {
    headers: { "User-Agent": "Legendary-Collectibles/MTG-Bulk-Importer" },
  });
  if (!res.ok) throw new Error(`GET /bulk-data failed: ${res.status} ${res.statusText}`);
  const j = await res.json();
  const item = (j.data || []).find((x) => x.type === kind);
  if (!item) throw new Error(`Bulk type "${kind}" not found.`);
  return { url: item.download_uri, updated_at: item.updated_at, size: item.size };
}

async function openReadable() {
  if (LOCAL_FILE) {
    const s = await stat(LOCAL_FILE);
    if (!s.isFile()) throw new Error(`--file is not a file: ${LOCAL_FILE}`);
    return createReadStream(LOCAL_FILE, { encoding: "utf8" });
  }
  const { url, updated_at, size } = await getBulkDownload(TYPE);
  console.log(`[source] ${TYPE} updated_at=${updated_at} size=${(size/1_000_000).toFixed(1)}MB`);
  const r = await fetch(url, { headers: { "User-Agent": "Legendary-Collectibles/MTG-Bulk-Importer" } });
  if (!r.ok) throw new Error(`GET bulk file failed: ${r.status} ${r.statusText}`);
  // Node fetch returns a web stream; convert to Node stream
  return Readable.fromWeb(r.body);
}

async function* streamArray(readable) {
  const streamer = readable.pipe(StreamArray.withParser());
  for await (const { value } of streamer) yield value;
}

// ---------------------- DB helpers ----------------------
function val(v) { return v ?? null; }
function j(v) { return v == null ? null : JSON.stringify(v); }
function intOrNull(v) { if (v === null || v === undefined) return null; const n = Number(v); return Number.isFinite(n) ? n : null; }
function numOrNull(v) { if (v === null || v === undefined || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; }

async function ensureRulingsUnique(pg) {
  // Create a dedup unique index so ON CONFLICT works without changing your schema
  await pg.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname='public' AND indexname='mtg_card_rulings_dedupe_idx'
      ) THEN
        CREATE UNIQUE INDEX mtg_card_rulings_dedupe_idx
        ON mtg_card_rulings (oracle_id, published_at, COALESCE(source,''), COALESCE(comment,''));
      END IF;
    END$$;
  `);
}

// ---------------------- Cards pipeline ----------------------
function mapCardRow(c) {
  return {
    id: val(c.id),
    oracle_id: val(c.oracle_id),
    set_id: val(c.set_id),
    set_code: val(c.set),
    set_name: val(c.set_name),
    collector_number: val(c.collector_number),
    lang: val(c.lang),
    name: val(c.name),
    printed_name: val(c.printed_name),
    layout: val(c.layout),
    released_at: val(c.released_at),
    highres_image: val(c.highres_image),
    image_status: val(c.image_status),
    image_uris: j(c.image_uris ?? null),
    mana_cost: val(c.mana_cost),
    cmc: numOrNull(c.cmc),
    type_line: val(c.type_line),
    oracle_text: val(c.oracle_text),
    printed_type_line: val(c.printed_type_line),
    printed_text: val(c.printed_text),
    power: val(c.power),
    toughness: val(c.toughness),
    loyalty: val(c.loyalty),
    defense: val(c.defense),
    colors: j(c.colors ?? null),
    color_identity: j(c.color_identity ?? null),
    produced_mana: j(c.produced_mana ?? null),
    keywords: j(c.keywords ?? null),
    games: j(c.games ?? null),
    legalities: j(c.legalities ?? null),
    rarity: val(c.rarity),
    artist: val(c.artist),
    artist_ids: j(c.artist_ids ?? null),
    illustration_id: val(c.illustration_id),
    border_color: val(c.border_color),
    frame: val(c.frame),
    frame_effects: j(c.frame_effects ?? null),
    security_stamp: val(c.security_stamp),
    full_art: val(c.full_art),
    textless: val(c.textless),
    booster: val(c.booster),
    story_spotlight: val(c.story_spotlight),
    edhrec_rank: intOrNull(c.edhrec_rank),
    penny_rank: intOrNull(c.penny_rank),
    prices: j(c.prices ?? null),
    related_uris: j(c.related_uris ?? null),
    purchase_uris: j(c.purchase_uris ?? null),
    arena_id: intOrNull(c.arena_id),
    mtgo_id: intOrNull(c.mtgo_id),
    mtgo_foil_id: intOrNull(c.mtgo_foil_id),
    multiverse_ids: j(c.multiverse_ids ?? null),
    tcgplayer_id: intOrNull(c.tcgplayer_id),
    cardmarket_id: intOrNull(c.cardmarket_id),
    reserved: val(c.reserved),
    reprint: val(c.reprint),
    variation: val(c.variation),
    variation_of: val(c.variation_of),
    promo: val(c.promo),
    finishes: j(c.finishes ?? null),
    security_bits: j(c.security_bits ?? null), // often null
    prints_search_uri: val(c.prints_search_uri),
    rulings_uri: val(c.rulings_uri),
    scryfall_uri: val(c.scryfall_uri),
    uri: val(c.uri),
    card_faces_raw: j(c.card_faces ?? null),
  };
}

const CARD_COLS = [
  "id","oracle_id","set_id","set_code","set_name","collector_number","lang","name","printed_name","layout",
  "released_at","highres_image","image_status","image_uris","mana_cost","cmc","type_line","oracle_text",
  "printed_type_line","printed_text","power","toughness","loyalty","defense","colors","color_identity",
  "produced_mana","keywords","games","legalities","rarity","artist","artist_ids","illustration_id",
  "border_color","frame","frame_effects","security_stamp","full_art","textless","booster","story_spotlight",
  "edhrec_rank","penny_rank","prices","related_uris","purchase_uris","arena_id","mtgo_id","mtgo_foil_id",
  "multiverse_ids","tcgplayer_id","cardmarket_id","reserved","reprint","variation","variation_of","promo",
  "finishes","security_bits","prints_search_uri","rulings_uri","scryfall_uri","uri","card_faces_raw"
];

function bindRows(rows, cols) {
  const args = [];
  const valuesSql = rows.map((r, i) => {
    const placeholders = cols.map((_, j) => `$${i*cols.length + j + 1}`);
    for (const c of cols) args.push(r[c]);
    return `(${placeholders.join(",")})`;
  }).join(",");
  return { args, valuesSql };
}

async function upsertCardsAndPricesAndFaces(pg, rows, facesByCard) {
  if (rows.length === 0) return;

  // 1) UPSERT mtg_cards
  {
    const { args, valuesSql } = bindRows(rows, CARD_COLS);
    const updates = CARD_COLS.filter(c => c !== "id").map(c => `"${c}"=EXCLUDED."${c}"`).join(",");
    const sql =
      `INSERT INTO mtg_cards (${CARD_COLS.map(c => `"${c}"`).join(",")})
       VALUES ${valuesSql}
       ON CONFLICT ("id") DO UPDATE SET ${updates}`;
    await pg.query(sql, args);
  }

  // 2) Prices upsert
  {
    const priceRows = rows.map(r => ({
      scryfall_id: r.id,
      set_code: r.set_code,
      collector_no: r.collector_number,
      usd: numOrNull(JSON.parse(r.prices || "null")?.usd),
      usd_foil: numOrNull(JSON.parse(r.prices || "null")?.usd_foil),
      usd_etched: numOrNull(JSON.parse(r.prices || "null")?.usd_etched),
      eur: numOrNull(JSON.parse(r.prices || "null")?.eur),
      eur_foil: numOrNull(JSON.parse(r.prices || "null")?.eur_foil),
      tix: numOrNull(JSON.parse(r.prices || "null")?.tix),
    }));

    const COLS = ["scryfall_id","set_code","collector_no","usd","usd_foil","usd_etched","eur","eur_foil","tix"];
    const { args, valuesSql } = bindRows(priceRows, COLS);
    const sql =
      `INSERT INTO mtg_card_prices (${COLS.map(c => `"${c}"`).join(",")})
       VALUES ${valuesSql}
       ON CONFLICT ("scryfall_id") DO UPDATE SET
         "set_code"=EXCLUDED."set_code",
         "collector_no"=EXCLUDED."collector_no",
         "usd"=EXCLUDED."usd",
         "usd_foil"=EXCLUDED."usd_foil",
         "usd_etched"=EXCLUDED."usd_etched",
         "eur"=EXCLUDED."eur",
         "eur_foil"=EXCLUDED."eur_foil",
         "tix"=EXCLUDED."tix",
         "updated_at"=now()`;
    await pg.query(sql, args);
  }

  // 3) Faces: delete those for cards in this batch, then insert fresh faces
  const cardIdsWithFaces = Object.keys(facesByCard);
  if (cardIdsWithFaces.length) {
    const delPlaceholders = cardIdsWithFaces.map((_, i) => `$${i+1}`).join(",");
    await pg.query(`DELETE FROM mtg_card_faces WHERE card_id IN (${delPlaceholders})`, cardIdsWithFaces);

    const faceRows = [];
    for (const [card_id, faces] of Object.entries(facesByCard)) {
      faces.forEach((f, idx) => {
        faceRows.push({
          card_id,
          face_index: idx,
          name: val(f.name),
          printed_name: val(f.printed_name),
          mana_cost: val(f.mana_cost),
          type_line: val(f.type_line),
          oracle_text: val(f.oracle_text),
          colors: j(f.colors ?? null),
          power: val(f.power),
          toughness: val(f.toughness),
          loyalty: val(f.loyalty),
          defense: val(f.defense),
          flavor_text: val(f.flavor_text),
          flavor_name: val(f.flavor_name),
          artist: val(f.artist),
          illustration_id: val(f.illustration_id),
          image_uris: j(f.image_uris ?? null),
        });
      });
    }

    if (faceRows.length) {
      const COLS = [
        "card_id","face_index","name","printed_name","mana_cost","type_line","oracle_text","colors",
        "power","toughness","loyalty","defense","flavor_text","flavor_name","artist","illustration_id","image_uris"
      ];
      const { args, valuesSql } = bindRows(faceRows, COLS);
      const sql =
        `INSERT INTO mtg_card_faces (${COLS.map(c => `"${c}"`).join(",")})
         VALUES ${valuesSql}`;
      await pg.query(sql, args);
    }
  }
}

// ---------------------- Rulings pipeline ----------------------
function mapRuling(r) {
  return {
    oracle_id: val(r.oracle_id),
    source: val(r.source),
    published_at: val(r.published_at),
    comment: val(r.comment),
  };
}

async function upsertRulings(pg, rows) {
  if (!rows.length) return;
  const COLS = ["oracle_id","source","published_at","comment"];
  const { args, valuesSql } = bindRows(rows, COLS);
  const sql =
    `INSERT INTO mtg_card_rulings (${COLS.map(c => `"${c}"`).join(",")})
     VALUES ${valuesSql}
     ON CONFLICT ON CONSTRAINT mtg_card_rulings_pkey DO NOTHING`; // pkey is serial; we can’t conflict on it
  // Use our unique index to avoid dupes:
  const sql2 =
    `INSERT INTO mtg_card_rulings (${COLS.map(c => `"${c}"`).join(",")})
     VALUES ${valuesSql}
     ON CONFLICT ON CONSTRAINT mtg_card_rulings_pkey DO NOTHING`;

  // Better: rely on the dedupe index we created:
  const sqlDedupe =
    `INSERT INTO mtg_card_rulings (${COLS.map(c => `"${c}"`).join(",")})
     VALUES ${valuesSql}
     ON CONFLICT ON CONSTRAINT mtg_card_rulings_pkey DO NOTHING`;

  // If we have the unique index (ensureRulingsUnique), we can do:
  const sqlUseUnique =
    `INSERT INTO mtg_card_rulings (${COLS.map(c => `"${c}"`).join(",")})
     VALUES ${valuesSql}
     ON CONFLICT (oracle_id, published_at, source, comment) DO NOTHING`;

  await pg.query(sqlUseUnique, args);
}

// ---------------------- Foreign names (from all_cards) ----------------------
function mapForeignRow(c) {
  // Only keep non-English
  if (!c.lang || c.lang.toLowerCase() === "en") return null;
  return {
    card_id: String(c.id),
    name: val(c.name),
    language: val(c.lang),
    multiverseid: Array.isArray(c.multiverse_ids) && c.multiverse_ids.length ? intOrNull(c.multiverse_ids[0]) : null,
  };
}

async function upsertForeignNames(pg, rows) {
  if (!rows.length) return;
  // Strategy: simple insert; if you want idempotency, you can clear + refill or add a unique index.
  // We'll add a best-effort dedupe unique index once:
  await pg.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname='public' AND indexname='mtg_card_foreign_names_dedupe_idx'
      ) THEN
        CREATE UNIQUE INDEX mtg_card_foreign_names_dedupe_idx
        ON mtg_card_foreign_names (card_id, COALESCE(language,''), COALESCE(name,''));
      END IF;
    END$$;
  `);

  const COLS = ["card_id","name","language","multiverseid"];
  const { args, valuesSql } = bindRows(rows, COLS);
  const sql =
    `INSERT INTO mtg_card_foreign_names (${COLS.map(c => `"${c}"`).join(",")})
     VALUES ${valuesSql}
     ON CONFLICT (card_id, language, name) DO NOTHING`;
  await pg.query(sql, args);
}

// ---------------------- Runner ----------------------
async function runCards(pg) {
  const src = await openReadable();
  const reader = streamArray(src);

  let batch = [];
  let facesByCard = {};
  let total = 0;

  const limit = pLimit(CONCURRENCY);
  const inflight = new Set();

  async function flush() {
    if (!batch.length) return;
    const rows = batch.splice(0, batch.length);
    const faces = facesByCard; facesByCard = {};

    const p = limit(async () => {
      await pg.query("BEGIN");
      try {
        await upsertCardsAndPricesAndFaces(pg, rows, faces);
        await pg.query("COMMIT");
      } catch (e) {
        await pg.query("ROLLBACK");
        console.error("\n[batch error] sample row:", rows[0]);
        throw e;
      }
    }).then(() => {
      total += rows.length;
      process.stdout.write(`\r[cards] upserted ${total.toLocaleString()}…`);
    }).catch((e) => {
      console.error("\n[cards] upsert failed:", e?.message || e);
      process.exitCode = 1;
    }).finally(() => inflight.delete(p));

    inflight.add(p);
  }

  for await (const c of reader) {
    // Map core row
    const row = mapCardRow(c);
    batch.push(row);

    // Capture faces if present
    if (Array.isArray(c.card_faces) && c.card_faces.length) {
      facesByCard[row.id] = c.card_faces;
    }

    if (batch.length >= BATCH_SIZE) await flush();
  }
  await flush();
  await Promise.allSettled(inflight);
  process.stdout.write("\n");
}

async function runRulings(pg) {
  await ensureRulingsUnique(pg);
  const src = await openReadable();
  const reader = streamArray(src);

  let batch = [];
  let total = 0;

  async function flush() {
    if (!batch.length) return;
    const rows = batch.splice(0, batch.length);
    await pg.query("BEGIN");
    try {
      await upsertRulings(pg, rows);
      await pg.query("COMMIT");
    } catch (e) {
      await pg.query("ROLLBACK");
      console.error("\n[rulings] batch failed:", e?.message || e);
      process.exitCode = 1;
    }
    total += rows.length;
    process.stdout.write(`\r[rulings] inserted ${total.toLocaleString()}…`);
  }

  for await (const r of reader) {
    const row = mapRuling(r);
    batch.push(row);
    if (batch.length >= BATCH_SIZE * 2) await flush();
  }
  await flush();
  process.stdout.write("\n");
}

async function runForeign(pg) {
  if (TYPE !== "all_cards" && !LOCAL_FILE) {
    console.log(`[foreign] For best coverage, run with --type=all_cards or --file=<all_cards.json>`);
  }
  const src = await openReadable();
  const reader = streamArray(src);

  let batch = [];
  let total = 0;

  async function flush() {
    if (!batch.length) return;
    const rows = batch.splice(0, batch.length);
    await pg.query("BEGIN");
    try {
      await upsertForeignNames(pg, rows);
      await pg.query("COMMIT");
    } catch (e) {
      await pg.query("ROLLBACK");
      console.error("\n[foreign] batch failed:", e?.message || e);
      process.exitCode = 1;
    }
    total += rows.length;
    process.stdout.write(`\r[foreign] inserted ${total.toLocaleString()}…`);
  }

  for await (const c of reader) {
    const row = mapForeignRow(c);
    if (row) batch.push(row);
    if (batch.length >= BATCH_SIZE * 2) await flush();
  }
  await flush();
  process.stdout.write("\n");
}

async function main() {
  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();

  console.log(`[start] command=${COMMAND} type=${TYPE} batch=${BATCH_SIZE} concurrency=${CONCURRENCY}`);

  try {
    if (COMMAND === "cards")      await runCards(pg);
    else if (COMMAND === "rulings") await runRulings(pg);
    else if (COMMAND === "foreign") await runForeign(pg);
    else throw new Error(`Unknown command: ${COMMAND}`);
  } finally {
    await pg.end();
  }
}

main().catch((e) => {
  console.error("[fatal]", e);
  process.exit(1);
});
