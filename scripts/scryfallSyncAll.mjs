#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * scripts/scryfallSyncAll.mjs
 *
 * Scryfall full ingest for MTG (sets, bulk cards, rulings, symbols, catalogs)
 * - Uses /bulk-data "default_cards" (or "all_cards" if SCRYFALL_BULK=all_cards)
 * - Streams huge JSON safely (array or JSONL), with progress logs and resume.
 *
 * ENV:
 *   LOAD_DB=true
 *   RESET_DB=true
 *   SCRYFALL_BULK=default_cards|all_cards   (default: default_cards)
 *   DATABASE_URL=postgresql://... (or PG_DSN)
 *   SCRYFALL_BATCH=300
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import readline from "node:readline";

/* ------------------------- ENV / CONSTANTS ------------------------- */

try { const { config } = await import("dotenv"); config(); } catch {}

const API = "https://api.scryfall.com";
const BULK_KIND = (process.env.SCRYFALL_BULK || "default_cards").toLowerCase(); // or "all_cards"
const LOAD_DB = String(process.env.LOAD_DB || "").toLowerCase() === "true";
const RESET_DB = String(process.env.RESET_DB || "").toLowerCase() === "true";
const PG_DSN = process.env.PG_DSN || process.env.DATABASE_URL || "";
const BATCH_SIZE = parseInt(process.env.SCRYFALL_BATCH || "500", 10);
const MAX_RETRIES = 7;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_DIR = path.resolve(__dirname, "..", "data", "scryfall");
await fsp.mkdir(OUT_DIR, { recursive: true });

const FILES = {
  bulkCards: path.join(OUT_DIR, `${BULK_KIND}.json`),   // unzipped
  rulings:   path.join(OUT_DIR, `rulings.json`),        // unzipped
  sets:      path.join(OUT_DIR, `sets.json`),
  symbols:   path.join(OUT_DIR, `symbols.json`),
  catalogs:  path.join(OUT_DIR, `catalogs.json`),       // [{ name, data[] }]
};

const CHECKPOINT_FILE = path.resolve(process.cwd(), ".scryfall-sync.checkpoint.json");

/* ----------------------------- LOG HELPERS ----------------------------- */

function ts() { return new Date().toISOString(); }
function log(...a)  { console.log(ts(), "-", ...a); }
function warn(...a) { console.warn(ts(), "-", ...a); }
function err(...a)  { console.error(ts(), "-", ...a); }

/* ----------------------------- CHECKPOINT ------------------------------ */

async function loadCheckpoint() {
  try { return JSON.parse(await fsp.readFile(CHECKPOINT_FILE, "utf8")); }
  catch {
    return {
      phase: "start",
      downloads: { bulkCards: false, rulings: false },
      setsDone: false,
      symbolsDone: false,
      catalogsDone: false,
      cards: { processed: 0, batchesCommitted: 0, lastId: null },
      rulings: { processed: 0, batchesCommitted: 0 },
      updatedAt: null,
    };
  }
}

async function saveCheckpoint(cp) {
  cp.updatedAt = ts();
  await fsp.writeFile(CHECKPOINT_FILE, JSON.stringify(cp, null, 2));
}

/* ----------------------------- DDL ----------------------------- */

const SCHEMA_SQL = `
BEGIN;

DROP TABLE IF EXISTS public.mtg_card_faces       CASCADE;
DROP TABLE IF EXISTS public.mtg_card_rulings     CASCADE;
DROP TABLE IF EXISTS public.mtg_card_prices      CASCADE;
DROP TABLE IF EXISTS public.mtg_cards            CASCADE;
DROP TABLE IF EXISTS public.mtg_sets             CASCADE;
DROP TABLE IF EXISTS public.mtg_symbols          CASCADE;
DROP TABLE IF EXISTS public.mtg_catalog_items    CASCADE;

CREATE TABLE public.mtg_sets (
  id                 uuid            PRIMARY KEY,
  code               text            UNIQUE,
  tcgplayer_id       integer,
  mtgo_code          text,
  name               text,
  set_type           text,
  released_at        date,
  card_count         integer,
  parent_set_code    text,
  digital            boolean,
  foil_only          boolean,
  nonfoil_only       boolean,
  block_code         text,
  block              text,
  icon_svg_uri       text,
  scryfall_uri       text,
  search_uri         text,
  uri                text
);
CREATE INDEX idx_mtg_sets_code ON public.mtg_sets (code);
CREATE INDEX idx_mtg_sets_release ON public.mtg_sets (released_at);

CREATE TABLE public.mtg_cards (
  id                 uuid            PRIMARY KEY,
  oracle_id          uuid,
  set_id             uuid REFERENCES public.mtg_sets(id) ON UPDATE CASCADE ON DELETE SET NULL,
  set_code           text,
  set_name           text,
  collector_number   text,
  lang               text,
  name               text,
  printed_name       text,
  layout             text,
  released_at        date,
  highres_image      boolean,
  image_status       text,
  image_uris         jsonb,
  mana_cost          text,
  cmc                numeric(10,2),
  type_line          text,
  oracle_text        text,
  printed_type_line  text,
  printed_text       text,
  power              text,
  toughness          text,
  loyalty            text,
  defense            text,
  colors             jsonb,
  color_identity     jsonb,
  produced_mana      jsonb,
  keywords           jsonb,
  games              jsonb,
  legalities         jsonb,
  rarity             text,
  artist             text,
  artist_ids         jsonb,
  illustration_id    uuid,
  border_color       text,
  frame              text,
  frame_effects      jsonb,
  security_stamp     text,
  full_art           boolean,
  textless           boolean,
  booster            boolean,
  story_spotlight    boolean,
  edhrec_rank        integer,
  penny_rank         integer,
  prices             jsonb,
  related_uris       jsonb,
  purchase_uris      jsonb,
  arena_id           integer,
  mtgo_id            integer,
  mtgo_foil_id       integer,
  multiverse_ids     jsonb,
  tcgplayer_id       integer,
  cardmarket_id      integer,
  reserved           boolean,
  reprint            boolean,
  variation          boolean,
  variation_of       uuid,
  promo              boolean,
  finishes           jsonb,
  security_bits      jsonb,
  prints_search_uri  text,
  rulings_uri        text,
  scryfall_uri       text,
  uri                text,
  card_faces_raw     jsonb
);
CREATE INDEX idx_mtg_cards_set_code ON public.mtg_cards (set_code);
CREATE INDEX idx_mtg_cards_name     ON public.mtg_cards (name);
CREATE INDEX idx_mtg_cards_oracle   ON public.mtg_cards (oracle_id);
CREATE INDEX idx_mtg_cards_released ON public.mtg_cards (released_at);
CREATE INDEX idx_mtg_cards_lang     ON public.mtg_cards (lang);

CREATE TABLE public.mtg_card_faces (
  id                 bigserial       PRIMARY KEY,
  card_id            uuid            NOT NULL REFERENCES public.mtg_cards(id) ON DELETE CASCADE,
  face_index         integer         NOT NULL,
  name               text,
  printed_name       text,
  mana_cost          text,
  type_line          text,
  oracle_text        text,
  colors             jsonb,
  power              text,
  toughness          text,
  loyalty            text,
  defense            text,
  flavor_text        text,
  flavor_name        text,
  artist             text,
  illustration_id    uuid,
  image_uris         jsonb
);
CREATE INDEX idx_mtg_faces_card ON public.mtg_card_faces (card_id);

CREATE TABLE public.mtg_card_rulings (
  id             bigserial   PRIMARY KEY,
  oracle_id      uuid        NOT NULL,
  source         text,
  published_at   date,
  comment        text
);
CREATE INDEX idx_mtg_rulings_oracle ON public.mtg_card_rulings (oracle_id);

CREATE TABLE public.mtg_card_prices (
  scryfall_id     uuid        PRIMARY KEY,
  set_code        text,
  collector_no    text,
  usd             numeric(12,2),
  usd_foil        numeric(12,2),
  usd_etched      numeric(12,2),
  eur             numeric(12,2),
  eur_foil        numeric(12,2),
  tix             numeric(12,2),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mtg_card_prices_setnum_idx ON public.mtg_card_prices (set_code, collector_no);

CREATE TABLE public.mtg_symbols (
  symbol               text PRIMARY KEY,
  loose_variant        text,
  english              text,
  transposable         boolean,
  represents_mana      boolean,
  appears_in_mana_costs boolean,
  funny                boolean,
  colors               jsonb,
  gatherer_alternates  jsonb,
  svg_uri              text,
  mana_value           numeric(10,2)
);

CREATE TABLE public.mtg_catalog_items (
  catalog   text NOT NULL,
  item      text NOT NULL,
  PRIMARY KEY (catalog, item)
);

COMMIT;
`;

/* ------------------------- HELPERS ------------------------- */

const sleep   = (ms) => new Promise((r) => setTimeout(r, ms));
const backoff = (a) => Math.min(30000, 600 * 2 ** a) + Math.floor(Math.random() * 250);

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const n  = (v, maxAbs = 1e9) => {
  if (v == null || v === "") return null;
  const f = typeof v === "number" ? v : parseFloat(v);
  if (!Number.isFinite(f)) return null;
  if (Math.abs(f) > maxAbs) return null;
  return f;
};
const jf = (v) => (v == null ? null : JSON.stringify(v));
const b  = (v) => v === true || v === "true" || v === 1;

/* ------------------- PG: Pool + per-batch retries -------------------- */

const TRANSIENT_PG_CODES = new Set(["57P01","57P02","57P03","53300","53400","40001","55P03"]);
const TRANSIENT_SYS_CODES = new Set(["ECONNRESET","ETIMEDOUT","EPIPE"]);

function isTransient(e) {
  const msg = String(e?.message || "");
  return TRANSIENT_PG_CODES.has(e?.code) ||
         TRANSIENT_SYS_CODES.has(e?.code) ||
         /terminating connection|server closed the connection|Connection terminated/i.test(msg);
}

let pool;
async function getPool() {
  if (pool) return pool;
  const { Pool } = await import("pg");
  const sslEnabled =
    /\bsslmode=require\b/i.test(PG_DSN || "") ||
    String(process.env.PGSSLMODE || "").toLowerCase() === "require" ||
    (process.env.PG_SSL || "").toLowerCase() === "true";

  pool = new Pool({
    connectionString: PG_DSN,
    max: Number(process.env.PG_POOL_MAX || 5),
    keepAlive: true,
    connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS || 15000),
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
    ssl: sslEnabled ? { rejectUnauthorized: false } : false,
    application_name: "scryfallSyncAll",
  });
  pool.on("error", (e) => warn("PG pool error:", e));
  return pool;
}

async function withPg(txFn, { retries = 10, maxBackoffMs = 60000 } = {}) {
  if (!LOAD_DB || !PG_DSN) return;
  const pool = await getPool();

  let attempt = 0;
  while (true) {
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      await client.query("SET idle_in_transaction_session_timeout = '5min'");
      await client.query("SET lock_timeout = '30s'");
      const res = await txFn(client);
      await client.query("COMMIT");
      client.release();
      return res;
    } catch (e) {
      try { if (client) await client.query("ROLLBACK"); } catch {}
      if (client) client.release();
      attempt++;
      if (!isTransient(e) || attempt > retries) throw e;
      const wait = Math.min(maxBackoffMs, 1000 * 2 ** (attempt - 1));
      warn(`withPg(): transient [${e.code || "ERR"} ${e.message}] retry ${attempt}/${retries} in ${Math.round(wait/1000)}s…`);
      await sleep(wait);
    }
  }
}

async function q(client, text, params = []) {
  return client.query(text, params);
}

/* ------------------------- HTTP + IO ------------------------- */

async function fetchJSON(url, label, tries = MAX_RETRIES) {
  for (let a = 0; a < tries; a++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return await res.json();
    } catch (e) {
      if (a === tries - 1) throw new Error(`${label}: ${e.message}`);
      const wait = backoff(a);
      warn(`[retry] ${label}: ${e.message}. Wait ${wait}ms`);
      await sleep(wait);
    }
  }
}

async function downloadMaybeGunzip(url, outPath, label) {
  const tmp = outPath + ".tmp";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${label} download: HTTP ${res.status}`);
  await fsp.rm(tmp, { force: true });

  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp));

  // Peek first 2 bytes for gzip magic: 0x1f 0x8b
  const fd = await fsp.open(tmp, "r");
  const hdr = Buffer.alloc(2);
  await fd.read(hdr, 0, 2, 0);
  await fd.close();
  const isGzip = hdr[0] === 0x1f && hdr[1] === 0x8b;

  await fsp.rm(outPath, { force: true });
  if (isGzip) {
    await pipeline(fs.createReadStream(tmp), zlib.createGunzip(), fs.createWriteStream(outPath));
  } else {
    await fsp.rename(tmp, outPath);
  }
  await fsp.rm(tmp, { force: true }).catch(() => {});
  const stat = await fsp.stat(outPath);
  log(`[download] ${label}: wrote ${stat.size.toLocaleString()} bytes -> ${outPath}`);
}

/* ---------------------- STREAMING DETECTION/PARSERS -------------------- */

async function detectBulkFormat(fp) {
  // returns 'array' if starts with [, 'jsonl' if starts with {, else throws
  const rs = fs.createReadStream(fp, { start: 0, end: 4095 });
  let buf = Buffer.alloc(0);
  for await (const chunk of rs) buf = Buffer.concat([buf, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
  const s = buf.toString("utf8").trimStart();
  const c = s[0];
  if (c === "[") return "array";
  if (c === "{") return "jsonl";
  throw new Error(`Unknown bulk file format for ${fp} (first non-space char=${JSON.stringify(c)})`);
}

/** Stream objects whether the file is JSON array or JSON Lines */
async function streamJsonObjects(filePath, onItem, { skip = 0, format = "array", progressEvery = 20000 } = {}) {
  let seen = 0;
  let lastLog = Date.now();

  if (format === "jsonl") {
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!line || !line.trim()) continue;
      seen++;
      if (seen <= skip) continue;

      try {
        const obj = JSON.parse(line);
        await onItem(obj);
      } catch (e) {
        err("streamJsonObjects(JSONL) parse/onItem error:", e?.message || e);
        throw e;
      }

      if (progressEvery && seen % progressEvery === 0) {
        const now = Date.now();
        if (now - lastLog > 1000) {
          log(`[stream] processed ${seen.toLocaleString()} objects…`);
          lastLog = now;
        }
      }
    }
    return;
  }

  // JSON array streaming (character scanner)
  const rs = fs.createReadStream(filePath, { encoding: "utf8" });
  let buf = "";
  let started = false;
  let inStr = false;
  let esc = false;
  let depth = 0;
  let objStart = -1;

  for await (const chunk of rs) {
    buf += chunk;

    for (let i = 0; i < buf.length; i++) {
      const ch = buf[i];

      if (!started) {
        if (ch === "[") started = true;
        continue;
      }

      if (inStr) {
        if (esc) { esc = false; continue; }
        if (ch === "\\") { esc = true; continue; }
        if (ch === "\"") { inStr = false; }
        continue;
      }

      if (ch === "\"") { inStr = true; continue; }
      if (ch === "{") {
        if (depth === 0) objStart = i;
        depth++;
        continue;
      }
      if (ch === "}") {
        depth--;
        if (depth === 0 && objStart >= 0) {
          const jsonStr = buf.slice(objStart, i + 1);
          seen++;

          if (seen > skip) {
            try {
              const obj = JSON.parse(jsonStr);
              await onItem(obj);
            } catch (e) {
              err("streamJsonObjects(array) onItem error:", e?.message || e);
              throw e;
            }
          }

          // advance buffer after comma/whitespace
          let j = i + 1;
          while (j < buf.length && /[\s,]/.test(buf[j])) j++;
          buf = buf.slice(j);
          i = -1;
          objStart = -1;

          if (progressEvery && seen % progressEvery === 0) {
            const now = Date.now();
            if (now - lastLog > 1000) {
              log(`[stream] processed ${seen.toLocaleString()} objects…`);
              lastLog = now;
            }
          }
        }
        continue;
      }
      if (ch === "]" && depth === 0) {
        buf = "";
      }
    }

    if (depth > 0 && objStart > 0) {
      buf = buf.slice(objStart);
      objStart = 0;
    } else if (depth === 0 && !/[\[\]\{\}]/.test(buf)) {
      buf = "";
    }
  }
}

/* ------------------------- FETCHERS ------------------------- */

const CATALOGS = [
  "card-names","artist-names","word-bank","flavor-words","ability-words",
  "keyword-abilities","keyword-actions","artifact-types","creature-types",
  "enchantment-types","land-types","planeswalker-types","spell-types",
  "powers","toughnesses","loyalties","watermarks",
];

async function fetchSetsAll() {
  const json = await fetchJSON(`${API}/sets`, "sets");
  await fsp.writeFile(FILES.sets, JSON.stringify(json, null, 2));
  return json?.data || [];
}
async function fetchBulk(kind) {
  const all = await fetchJSON(`${API}/bulk-data`, "bulk list");
  const item = (all?.data || []).find((x) => x.type === kind);
  if (!item) throw new Error(`Bulk item ${kind} not found`);
  await downloadMaybeGunzip(item.download_uri, FILES.bulkCards, `${kind} file`);
  return FILES.bulkCards;
}
async function fetchBulkRulings() {
  const all = await fetchJSON(`${API}/bulk-data`, "bulk list");
  const item = (all?.data || []).find((x) => x.type === "rulings");
  if (!item) throw new Error(`Bulk item rulings not found`);
  await downloadMaybeGunzip(item.download_uri, FILES.rulings, `rulings file`);
  return FILES.rulings;
}
async function fetchSymbols() {
  const json = await fetchJSON(`${API}/symbology`, "symbology");
  await fsp.writeFile(FILES.symbols, JSON.stringify(json, null, 2));
  return json?.data || [];
}
async function fetchCatalog(cat) {
  const url = `https://api.scryfall.com/catalog/${cat}`;
  for (let a = 0; a <= MAX_RETRIES; a++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (res.status >= 500) {
        if (a === MAX_RETRIES) throw new Error(`HTTP ${res.status} after retries`);
        const wait = backoff(a);
        warn(`[retry] catalog:${cat}: HTTP ${res.status}. Wait ${wait}ms`);
        await sleep(wait);
        continue;
      }
      if (!res.ok) {
        warn(`[skip] catalog:${cat}: HTTP ${res.status} ${res.statusText}`);
        return null;
      }
      return await res.json();
    } catch (error) {
      if (a === MAX_RETRIES) throw error;
      const wait = backoff(a);
      warn(`[retry] catalog:${cat} network: ${error?.message || error}. Wait ${wait}ms`);
      await sleep(wait);
    }
  }
  return null;
}
async function fetchCatalogs() {
  const packs = [];
  for (const name of CATALOGS) {
    const j = await fetchCatalog(name);
    if (!j) continue;
    packs.push({ name, data: j?.data || [] });
    await sleep(120);
  }
  await fsp.writeFile(FILES.catalogs, JSON.stringify(packs, null, 2));
  return packs;
}

/* ------------------------- UPSERTS (client-based) --------------------- */

async function upsertSets(client, sets) {
  if (!sets?.length) return;
  const cols = [
    "id","code","tcgplayer_id","mtgo_code","name","set_type","released_at","card_count",
    "parent_set_code","digital","foil_only","nonfoil_only","block_code","block",
    "icon_svg_uri","scryfall_uri","search_uri","uri",
  ];

  const CHUNK = 300;
  for (const part of chunk(sets, CHUNK)) {
    const params = [];
    const values = [];
    let i = 1;
    for (const s of part) {
      params.push(
        s.id ?? null, s.code ?? null, s.tcgplayer_id ?? null, s.mtgo_code ?? null,
        s.name ?? null, s.set_type ?? null, s.released_at ?? null, s.card_count ?? null,
        s.parent_set_code ?? null, b(s.digital), b(s.foil_only), b(s.nonfoil_only),
        s.block_code ?? null, s.block ?? null, s.icon_svg_uri ?? null, s.scryfall_uri ?? null,
        s.search_uri ?? null, s.uri ?? null
      );
      values.push(`(${cols.map(() => `$${i++}`).join(",")})`);
    }

    await q(client, `
      INSERT INTO public.mtg_sets (${cols.join(",")})
      VALUES ${values.join(",")}
      ON CONFLICT (id) DO UPDATE SET
        code=EXCLUDED.code, tcgplayer_id=EXCLUDED.tcgplayer_id, mtgo_code=EXCLUDED.mtgo_code,
        name=EXCLUDED.name, set_type=EXCLUDED.set_type, released_at=EXCLUDED.released_at,
        card_count=EXCLUDED.card_count, parent_set_code=EXCLUDED.parent_set_code,
        digital=EXCLUDED.digital, foil_only=EXCLUDED.foil_only, nonfoil_only=EXCLUDED.nonfoil_only,
        block_code=EXCLUDED.block_code, block=EXCLUDED.block,
        icon_svg_uri=EXCLUDED.icon_svg_uri, scryfall_uri=EXCLUDED.scryfall_uri,
        search_uri=EXCLUDED.search_uri, uri=EXCLUDED.uri
    `, params);
  }
}

async function upsertCardsBatch(client, cards) {
  if (!cards.length) return;

  const cols = [
    "id","oracle_id","set_id","set_code","set_name","collector_number","lang",
    "name","printed_name","layout","released_at","highres_image","image_status",
    "image_uris",
    "mana_cost","cmc","type_line","oracle_text","printed_type_line","printed_text",
    "power","toughness","loyalty","defense",
    "colors","color_identity","produced_mana","keywords","games",
    "legalities","rarity","artist","artist_ids","illustration_id",
    "border_color","frame","frame_effects","security_stamp","full_art","textless","booster","story_spotlight",
    "edhrec_rank","penny_rank",
    "prices","related_uris","purchase_uris",
    "arena_id","mtgo_id","mtgo_foil_id","multiverse_ids","tcgplayer_id","cardmarket_id",
    "reserved","reprint","variation","variation_of","promo","finishes","security_bits",
    "prints_search_uri","rulings_uri","scryfall_uri","uri",
    "card_faces_raw",
  ];

  const params = [];
  const values = [];
  let i = 1;

  const faceRows = [];
  const priceRows = [];

  for (const c of cards) {
    params.push(
      c.id ?? null, c.oracle_id ?? null, c.set_id ?? null, c.set ?? null, c.set_name ?? null,
      c.collector_number ?? null, c.lang ?? null,
      c.name ?? null, c.printed_name ?? null, c.layout ?? null, c.released_at ?? null, b(c.highres_image), c.image_status ?? null,
      jf(c.image_uris ?? null),
      c.mana_cost ?? null, n(c.cmc), c.type_line ?? null, c.oracle_text ?? null, c.printed_type_line ?? null, c.printed_text ?? null,
      c.power ?? null, c.toughness ?? null, c.loyalty ?? null, c.defense ?? null,
      jf(c.colors ?? null), jf(c.color_identity ?? null), jf(c.produced_mana ?? null), jf(c.keywords ?? null), jf(c.games ?? null),
      jf(c.legalities ?? null), c.rarity ?? null, c.artist ?? null, jf(c.artist_ids ?? null), c.illustration_id ?? null,
      c.border_color ?? null, c.frame ?? null, jf(c.frame_effects ?? null), c.security_stamp ?? null, b(c.full_art), b(c.textless), b(c.booster), b(c.story_spotlight),
      c.edhrec_rank ?? null, c.penny_rank ?? null,
      jf(c.prices ?? null), jf(c.related_uris ?? null), jf(c.purchase_uris ?? null),
      c.arena_id ?? null, c.mtgo_id ?? null, c.mtgo_foil_id ?? null, jf(c.multiverse_ids ?? null), c.tcgplayer_id ?? null, c.cardmarket_id ?? null,
      b(c.reserved), b(c.reprint), b(c.variation), c.variation_of ?? null, b(c.promo), jf(c.finishes ?? null), jf(null),
      c.prints_search_uri ?? null, c.rulings_uri ?? null, c.scryfall_uri ?? null, c.uri ?? null,
      jf(c.card_faces ?? null)
    );
    values.push(`(${cols.map(() => `$${i++}`).join(",")})`);

    const p = c.prices || {};
    priceRows.push({
      id: c.id, set: c.set ?? null, no: c.collector_number ?? null,
      usd: n(p.usd), usd_foil: n(p.usd_foil), usd_etched: n(p.usd_etched),
      eur: n(p.eur), eur_foil: n(p.eur_foil), tix: n(p.tix),
    });

    if (Array.isArray(c.card_faces)) {
      c.card_faces.forEach((f, idx) => {
        faceRows.push({
          card_id: c.id, idx,
          name: f.name ?? null, printed_name: f.printed_name ?? null,
          mana_cost: f.mana_cost ?? null, type_line: f.type_line ?? null, oracle_text: f.oracle_text ?? null,
          colors: jf(f.colors ?? null), power: f.power ?? null, toughness: f.toughness ?? null,
          loyalty: f.loyalty ?? null, defense: f.defense ?? null,
          flavor_text: f.flavor_text ?? null, flavor_name: f.flavor_name ?? null,
          artist: f.artist ?? null, illustration_id: f.illustration_id ?? null,
          image_uris: jf(f.image_uris ?? null),
        });
      });
    }
  }

  await q(client, "BEGIN");
  try {
    await q(client, `
      INSERT INTO public.mtg_cards (${cols.join(",")})
      VALUES ${values.join(",")}
      ON CONFLICT (id) DO UPDATE SET
        oracle_id=EXCLUDED.oracle_id, set_id=EXCLUDED.set_id, set_code=EXCLUDED.set_code, set_name=EXCLUDED.set_name,
        collector_number=EXCLUDED.collector_number, lang=EXCLUDED.lang,
        name=EXCLUDED.name, printed_name=EXCLUDED.printed_name, layout=EXCLUDED.layout, released_at=EXCLUDED.released_at,
        highres_image=EXCLUDED.highres_image, image_status=EXCLUDED.image_status, image_uris=EXCLUDED.image_uris,
        mana_cost=EXCLUDED.mana_cost, cmc=EXCLUDED.cmc, type_line=EXCLUDED.type_line, oracle_text=EXCLUDED.oracle_text,
        printed_type_line=EXCLUDED.printed_type_line, printed_text=EXCLUDED.printed_text,
        power=EXCLUDED.power, toughness=EXCLUDED.toughness, loyalty=EXCLUDED.loyalty, defense=EXCLUDED.defense,
        colors=EXCLUDED.colors, color_identity=EXCLUDED.color_identity, produced_mana=EXCLUDED.produced_mana, keywords=EXCLUDED.keywords, games=EXCLUDED.games,
        legalities=EXCLUDED.legalities, rarity=EXCLUDED.rarity, artist=EXCLUDED.artist, artist_ids=EXCLUDED.artist_ids, illustration_id=EXCLUDED.illustration_id,
        border_color=EXCLUDED.border_color, frame=EXCLUDED.frame, frame_effects=EXCLUDED.frame_effects, security_stamp=EXCLUDED.security_stamp,
        full_art=EXCLUDED.full_art, textless=EXCLUDED.textless, booster=EXCLUDED.booster, story_spotlight=EXCLUDED.story_spotlight,
        edhrec_rank=EXCLUDED.edhrec_rank, penny_rank=EXCLUDED.penny_rank,
        prices=EXCLUDED.prices, related_uris=EXCLUDED.related_uris, purchase_uris=EXCLUDED.purchase_uris,
        arena_id=EXCLUDED.arena_id, mtgo_id=EXCLUDED.mtgo_id, mtgo_foil_id=EXCLUDED.mtgo_foil_id, multiverse_ids=EXCLUDED.multiverse_ids,
        tcgplayer_id=EXCLUDED.tcgplayer_id, cardmarket_id=EXCLUDED.cardmarket_id,
        reserved=EXCLUDED.reserved, reprint=EXCLUDED.reprint, variation=EXCLUDED.variation, variation_of=EXCLUDED.variation_of,
        promo=EXCLUDED.promo, finishes=EXCLUDED.finishes, security_bits=EXCLUDED.security_bits,
        prints_search_uri=EXCLUDED.prints_search_uri, rulings_uri=EXCLUDED.rulings_uri, scryfall_uri=EXCLUDED.scryfall_uri, uri=EXCLUDED.uri,
        card_faces_raw=EXCLUDED.card_faces_raw
    `);

    const ids = cards.map((c) => c.id).filter(Boolean);
    if (ids.length) {
      const ph = ids.map((_, k) => `$${k + 1}`).join(",");
      await q(client, `DELETE FROM public.mtg_card_faces WHERE card_id IN (${ph})`, ids);
    }
    if (faceRows.length) {
      const p = [];
      const v = faceRows.map((r, k) => {
        const b = k * 17;
        p.push(
          r.card_id, r.idx, r.name, r.printed_name, r.mana_cost, r.type_line, r.oracle_text,
          r.colors, r.power, r.toughness, r.loyalty, r.defense, r.flavor_text, r.flavor_name,
          r.artist, r.illustration_id, r.image_uris
        );
        return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},$${b+13},$${b+14},$${b+15},$${b+16},$${b+17})`;
      });
      await q(client,
        `INSERT INTO public.mtg_card_faces
         (card_id, face_index, name, printed_name, mana_cost, type_line, oracle_text, colors, power, toughness, loyalty, defense, flavor_text, flavor_name, artist, illustration_id, image_uris)
         VALUES ${v.join(",")}`, p);
    }

    if (priceRows.length) {
      const p = [];
      const v = priceRows.map((r, k) => {
        const b = k * 9;
        p.push(r.id, r.set, r.no, r.usd, r.usd_foil, r.usd_etched, r.eur, r.eur_foil, r.tix);
        return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9})`;
      });
      await q(client, `
        INSERT INTO public.mtg_card_prices (scryfall_id,set_code,collector_no,usd,usd_foil,usd_etched,eur,eur_foil,tix)
        VALUES ${v.join(",")}
        ON CONFLICT (scryfall_id) DO UPDATE SET
          set_code=EXCLUDED.set_code, collector_no=EXCLUDED.collector_no,
          usd=EXCLUDED.usd, usd_foil=EXCLUDED.usd_foil, usd_etched=EXCLUDED.usd_etched,
          eur=EXCLUDED.eur, eur_foil=EXCLUDED.eur_foil, tix=EXCLUDED.tix,
          updated_at=now()
      `, p);
    }

    await q(client, "COMMIT");
  } catch (e) {
    try { await q(client, "ROLLBACK"); } catch {}
    throw e;
  }
}

async function upsertRulings(client, rulings) {
  if (!rulings?.length) return;
  const byOracle = new Map();
  for (const r of rulings) {
    const key = r.oracle_id;
    if (!key) continue;
    if (!byOracle.has(key)) byOracle.set(key, []);
    byOracle.get(key).push(r);
  }
  for (const [oracle, list] of byOracle) {
    await q(client, "BEGIN");
    try {
      await q(client, `DELETE FROM public.mtg_card_rulings WHERE oracle_id = $1`, [oracle]);
      if (list.length) {
        const p = [];
        const v = list.map((r, k) => {
          const b = k * 4;
          p.push(r.oracle_id ?? null, r.source ?? null, r.published_at ?? null, r.comment ?? null);
          return `($${b+1},$${b+2},$${b+3},$${b+4})`;
        });
        await q(client,
          `INSERT INTO public.mtg_card_rulings (oracle_id, source, published_at, comment) VALUES ${v.join(",")}`,
          p);
      }
      await q(client, "COMMIT");
    } catch (e) {
      try { await q(client, "ROLLBACK"); } catch {}
      throw e;
    }
  }
}

async function upsertSymbols(client, symbols) {
  if (!symbols?.length) return;
  await q(client, "BEGIN");
  try {
    await q(client, `TRUNCATE public.mtg_symbols`);
    const p = [];
    const v = symbols.map((s, k) => {
      const b = k * 11;
      p.push(
        s.symbol ?? null, s.loose_variant ?? null, s.english ?? null, s.transposable ?? null,
        s.represents_mana ?? null, s.appears_in_mana_costs ?? null, s.funny ?? null,
        JSON.stringify(s.colors ?? null), JSON.stringify(s.gatherer_alternates ?? null),
        s.svg_uri ?? null, n(s.mana_value)
      );
      return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11})`;
    });
    await q(client,
      `INSERT INTO public.mtg_symbols
       (symbol,loose_variant,english,transposable,represents_mana,appears_in_mana_costs,funny,colors,gatherer_alternates,svg_uri,mana_value)
       VALUES ${v.join(",")}
       ON CONFLICT (symbol) DO UPDATE SET
         loose_variant=EXCLUDED.loose_variant, english=EXCLUDED.english, transposable=EXCLUDED.transposable,
         represents_mana=EXCLUDED.represents_mana, appears_in_mana_costs=EXCLUDED.appears_in_mana_costs, funny=EXCLUDED.funny,
         colors=EXCLUDED.colors, gatherer_alternates=EXCLUDED.gatherer_alternates, svg_uri=EXCLUDED.svg_uri, mana_value=EXCLUDED.mana_value
      `, p);
    await q(client, "COMMIT");
  } catch (e) {
    try { await q(client, "ROLLBACK"); } catch {}
    throw e;
  }
}

async function upsertCatalogs(client, list) {
  if (!list?.length) return;

  const CHUNK = 1000;

  await q(client, "BEGIN");
  try {
    await q(client, `TRUNCATE public.mtg_catalog_items`);

    for (const cat of list) {
      const items = Array.isArray(cat?.data) ? cat.data : [];
      if (!items.length) continue;

      for (const piece of chunk(items, CHUNK)) {
        const params = [];
        const values = piece.map((item, i) => {
          const b = i * 2;
          params.push(cat.name, String(item));
          return `($${b + 1}, $${b + 2})`;
        });

        await q(client,
          `INSERT INTO public.mtg_catalog_items (catalog, item)
           VALUES ${values.join(",")}
           ON CONFLICT (catalog, item) DO NOTHING`,
          params);
      }
    }

    await q(client, "COMMIT");
  } catch (e) {
    try { await q(client, "ROLLBACK"); } catch {}
    throw e;
  }
}

/* --------------------------- MAIN --------------------------- */

async function fileJson(pathname) {
  const raw = await fsp.readFile(pathname, "utf8");
  return JSON.parse(raw);
}

async function main() {
  log(`[setup] OUT_DIR: ${OUT_DIR}`);
  const cp = await loadCheckpoint();

  // Downloads
  if (!cp.downloads.bulkCards) {
    log("[download] sets/symbols/catalogs + bulk cards…");
    await Promise.all([fetchSetsAll(), fetchSymbols(), fetchCatalogs()]);
    await fetchBulk(BULK_KIND);
    cp.downloads.bulkCards = true;
    await saveCheckpoint(cp);
  }

  if (!cp.downloads.rulings) {
    log("[download] rulings…");
    await fetchBulkRulings();
    cp.downloads.rulings = true;
    await saveCheckpoint(cp);
  }

  if (!LOAD_DB) {
    log("Downloaded data. Set LOAD_DB=true to load into Postgres.");
    return;
  }

  // Schema reset (once)
  if (RESET_DB && cp.phase === "start") {
    log("[db] resetting schema…");
    await withPg(async (client) => { await q(client, SCHEMA_SQL); });
    cp.phase = "schema-reset";
    await saveCheckpoint(cp);
  }

  // Load small tables from files
  const setsJson     = (await fileJson(FILES.sets)).data || [];
  const symbolsJson  = (await fileJson(FILES.symbols)).data || [];
  const catalogsJson = await fileJson(FILES.catalogs);

  if (!cp.setsDone) {
    log("[db] upserting sets…");
    await withPg(async (client) => { await upsertSets(client, setsJson); });
    cp.setsDone = true;
    await saveCheckpoint(cp);
  }

  if (!cp.symbolsDone) {
    log("[db] upserting symbols…");
    await withPg(async (client) => { await upsertSymbols(client, symbolsJson); });
    cp.symbolsDone = true;
    await saveCheckpoint(cp);
  }

  if (!cp.catalogsDone) {
    log("[db] upserting catalogs…");
    await withPg(async (client) => { await upsertCatalogs(client, catalogsJson); });
    cp.catalogsDone = true;
    await saveCheckpoint(cp);
  }

  // Derived frame-effects (built during cards pass)
  const frameEffects = new Set();

  // Cards (streamed + checkpointed)
  const bulkFormat = await detectBulkFormat(FILES.bulkCards);
  log(`[db] upserting cards (streamed) — format=${bulkFormat} …`);

  {
    let batch = [];
    let processed = cp.cards?.processed || 0;
    let batchesCommitted = cp.cards?.batchesCommitted || 0;

    await streamJsonObjects(
      FILES.bulkCards,
      async (obj) => {
        // derive frame effects from cards & faces
        if (Array.isArray(obj.frame_effects)) {
          for (const fe of obj.frame_effects) frameEffects.add(String(fe));
        }
        if (Array.isArray(obj.card_faces)) {
          for (const f of obj.card_faces) {
            if (Array.isArray(f.frame_effects)) {
              for (const fe of f.frame_effects) frameEffects.add(String(fe));
            }
          }
        }

        batch.push(obj);
        if (batch.length >= BATCH_SIZE) {
          const toInsert = batch;
          batch = [];

          await withPg(async (client) => { await upsertCardsBatch(client, toInsert); });
          processed += toInsert.length;
          batchesCommitted += 1;

          cp.cards = {
            processed,
            batchesCommitted,
            lastId: toInsert.at(-1)?.id || null,
          };
          await saveCheckpoint(cp);

          if (processed % 5000 === 0) {
            log(`[cards] committed: +${toInsert.length} (total ${processed}, batches ${batchesCommitted})`);
          }
        }
      },
      { skip: processed, format: bulkFormat, progressEvery: 20000 }
    );

    if (batch.length) {
      const toInsert = batch;
      await withPg(async (client) => { await upsertCardsBatch(client, toInsert); });
      processed += toInsert.length;
      batchesCommitted += 1;
      cp.cards = {
        processed,
        batchesCommitted,
        lastId: toInsert.at(-1)?.id || null,
      };
      await saveCheckpoint(cp);
    }
    log(`[db] cards done. total=${processed}`);
  }

  // Derived frame-effects as virtual catalog
  if (frameEffects.size) {
    log("[db] upserting derived catalog: frame-effects…");
    await withPg(async (client) => {
      await upsertCatalogs(client, [{ name: "frame-effects", data: Array.from(frameEffects).sort() }]);
    });
  }

  // Rulings (streamed + checkpointed)
  const rulingsFormat = await detectBulkFormat(FILES.rulings).catch(() => "array"); // rulings are usually array
  log(`[db] upserting rulings (streamed) — format=${rulingsFormat} …`);
  {
    const ruleBatch = [];
    let processed = cp.rulings?.processed || 0;
    let batchesCommitted = cp.rulings?.batchesCommitted || 0;

    await streamJsonObjects(
      FILES.rulings,
      async (r) => {
        ruleBatch.push(r);
        if (ruleBatch.length >= 5000) {
          const part = ruleBatch.splice(0, ruleBatch.length);
          await withPg(async (client) => { await upsertRulings(client, part); });
          processed += part.length;
          batchesCommitted += 1;
          cp.rulings = { processed, batchesCommitted };
          await saveCheckpoint(cp);
          log(`[rulings] committed: +${part.length} (total ${processed}, batches ${batchesCommitted})`);
        }
      },
      { skip: processed, format: rulingsFormat, progressEvery: 40000 }
    );

    if (ruleBatch.length) {
      const part = ruleBatch.splice(0, ruleBatch.length);
      await withPg(async (client) => { await upsertRulings(client, part); });
      processed += part.length;
      batchesCommitted += 1;
      cp.rulings = { processed, batchesCommitted };
      await saveCheckpoint(cp);
    }
  }

  log("DB load complete ✅");
}

/* --------------------- graceful shutdown & run ------------------------ */

process.on("SIGINT", async () => {
  try { await saveCheckpoint(await loadCheckpoint()); } catch {}
  console.log("\nInterrupted — checkpoint saved. Bye.");
  process.exit(1);
});
process.on("SIGTERM", async () => {
  try { await saveCheckpoint(await loadCheckpoint()); } catch {}
  console.log("\nTerminated — checkpoint saved. Bye.");
  process.exit(1);
});
process.on("unhandledRejection", (e) => {
  err("unhandledRejection:", e?.message || e);
});

await main().catch(async (e) => {
  err("Failed:", e);
  try { await saveCheckpoint(await loadCheckpoint()); } catch {}
  process.exit(1);
});
