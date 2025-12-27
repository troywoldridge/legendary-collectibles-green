#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * pokemonSyncAll.mjs — FAST + RESUMABLE + DB LOADER (WORKING)
 *
 * Fetches:
 *  - Meta: types, subtypes, supertypes, rarities
 *  - Sets (JSONL)
 *  - Cards (JSONL)
 *
 * Writes snapshots to:
 *   <project-root>/data/pokemontcg/
 *
 * Then optionally loads into Postgres (your schema):
 *   LOAD_DB=true
 *   PG_DSN=postgres://...  (or DATABASE_URL)
 *
 * FLAGS:
 *   --db-only / --skip-fetch   Load DB only (use existing JSON/JSONL files)
 *   --reset-checkpoint         Start fetching from page 1 again
 *
 * Optional tuning ENV:
 *   PAGE_SIZE=250              (default 250)
 *   PAGE_DELAY_MS=250          (default 250)
 *   MAX_RETRIES=10             (default 10)
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/* ----------------------------- dotenv ----------------------------- */
let dotenvLoaded = false;
try {
  const { config } = await import("dotenv");
  config();
  dotenvLoaded = true;
} catch {}

/* ----------------------------- CLI FLAGS ----------------------------- */
const DB_ONLY = process.argv.includes("--db-only") || process.argv.includes("--skip-fetch");
const SKIP_FETCH = DB_ONLY;
const RESET_CHECKPOINT = process.argv.includes("--reset-checkpoint");

/* ----------------------------- CONFIG ----------------------------- */
const API_BASE = "https://api.pokemontcg.io/v2";
const API_KEY = process.env.POKEMON_TCG_API_KEY || "";
const LOAD_DB = String(process.env.LOAD_DB || "").toLowerCase() === "true";
const LOAD_HISTORY = String(process.env.LOAD_HISTORY || "").toLowerCase() === "true";
const PG_DSN = process.env.PG_DSN || process.env.DATABASE_URL || "";

// IMPORTANT: write under project root
const PROJECT_ROOT = process.cwd();
const OUT_DIR = path.resolve(PROJECT_ROOT, "data", "pokemontcg");
const CHECKPOINT_FILE = path.join(OUT_DIR, ".checkpoint.json");

const MAX_PAGE_SIZE = Number(process.env.PAGE_SIZE || 250);
const PAGE_DELAY_MS = Number(process.env.PAGE_DELAY_MS || 250);
const MAX_RETRIES = Number(process.env.MAX_RETRIES || 10);

const HEADERS = {
  Accept: "application/json",
  ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const backoff = (attempt) => {
  const base = Math.min(45000, 800 * Math.pow(2, attempt));
  const jitter = Math.floor(Math.random() * 500);
  return base + jitter;
};

async function ensureDir(p) {
  await fsp.mkdir(p, { recursive: true });
}

/* ----------------------------- CHECKPOINT ----------------------------- */

async function readCheckpoint() {
  try {
    const txt = await fsp.readFile(CHECKPOINT_FILE, "utf8");
    return JSON.parse(txt);
  } catch {
    return {};
  }
}

async function writeCheckpoint(cp) {
  await fsp.writeFile(CHECKPOINT_FILE, JSON.stringify(cp, null, 2), "utf8");
}

/* ----------------------------- FETCH ----------------------------- */

async function fetchWithRetry(url, opts = {}, label = "") {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        ...opts,
        headers: { ...HEADERS, ...(opts.headers || {}) },
      });

      if (res.status === 429 || res.status >= 500) {
        const txt = await res.text().catch(() => "");
        if (attempt === MAX_RETRIES) {
          throw new Error(`HTTP ${res.status} after ${MAX_RETRIES} retries: ${txt}`);
        }
        const ra = Number(res.headers.get("retry-after") || "");
        const wait = Number.isFinite(ra) ? ra * 1000 : backoff(attempt);
        console.warn(`[retry] ${label} -> ${res.status}. Waiting ${wait}ms…`);
        await sleep(wait);
        continue;
      }

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.statusText}: ${txt}`);
      }

      const json = await res.json();

      // best-effort throttle if headers exist
      const remaining = Number(res.headers.get("x-ratelimit-remaining") || "");
      if (Number.isFinite(remaining) && remaining <= 2) {
        console.warn(`[rate] low remaining (${remaining}). Sleeping 2000ms…`);
        await sleep(2000);
      }

      return json;
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      const wait = backoff(attempt);
      console.warn(`[retry] ${label} error: ${err?.message || err}. Waiting ${wait}ms…`);
      await sleep(wait);
    }
  }
  throw new Error("unreachable");
}

/* ----------------------------- META ----------------------------- */

async function fetchMetaLists() {
  const [types, subtypes, supertypes, rarities] = await Promise.all([
    fetchWithRetry(`${API_BASE}/types`, {}, "types"),
    fetchWithRetry(`${API_BASE}/subtypes`, {}, "subtypes"),
    fetchWithRetry(`${API_BASE}/supertypes`, {}, "supertypes"),
    fetchWithRetry(`${API_BASE}/rarities`, {}, "rarities"),
  ]);
  return {
    types: types?.data ?? types ?? [],
    subtypes: subtypes?.data ?? subtypes ?? [],
    supertypes: supertypes?.data ?? supertypes ?? [],
    rarities: rarities?.data ?? rarities ?? [],
  };
}

/**
 * FAST + RESUMABLE pager:
 * - Streams JSONL via one WriteStream
 * - Stores checkpoint after each page
 */
async function fetchPaged(endpoint, outFile) {
  const cpAll = await readCheckpoint();
  const cp = cpAll?.[endpoint] || {};
  const startPage = RESET_CHECKPOINT ? 1 : Number(cp.page || 1);

  const shouldAppend = !RESET_CHECKPOINT && startPage > 1 && fs.existsSync(outFile);
  const stream = fs.createWriteStream(outFile, { flags: shouldAppend ? "a" : "w" });

  try {
    const firstUrl = `${API_BASE}/${endpoint}?page=${startPage}&pageSize=${MAX_PAGE_SIZE}`;
    const first = await fetchWithRetry(firstUrl, {}, `${endpoint} page ${startPage}`);

    const totalCount =
      first.totalCount ?? first.total ?? first.count ?? (first.data ? first.data.length : 0);
    const totalPages = totalCount ? Math.ceil(totalCount / MAX_PAGE_SIZE) : startPage;

    const writeBatch = (batch) => {
      if (!batch?.length) return 0;
      for (const o of batch) stream.write(JSON.stringify(o) + "\n");
      return batch.length;
    };

    let wrote = 0;

    wrote += writeBatch(first.data || []);
    console.log(`[${endpoint}] page ${startPage}/${totalPages} (+${first.data?.length || 0})`);

    cpAll[endpoint] = {
      page: startPage + 1,
      totalPages,
      totalCount,
      pageSize: MAX_PAGE_SIZE,
      updatedAt: new Date().toISOString(),
    };
    await writeCheckpoint(cpAll);

    if (totalPages <= startPage) return;

    for (let page = startPage + 1; page <= totalPages; page++) {
      const url = `${API_BASE}/${endpoint}?page=${page}&pageSize=${MAX_PAGE_SIZE}`;
      const json = await fetchWithRetry(url, {}, `${endpoint} page ${page}`);
      const batch = json.data || [];
      wrote += writeBatch(batch);

      console.log(`[${endpoint}] page ${page}/${totalPages} (+${batch.length}) wrote ${wrote}/${totalCount}`);

      cpAll[endpoint] = {
        page: page + 1,
        totalPages,
        totalCount,
        pageSize: MAX_PAGE_SIZE,
        updatedAt: new Date().toISOString(),
      };
      await writeCheckpoint(cpAll);

      await sleep(PAGE_DELAY_MS);
      if (batch.length === 0) break;
    }
  } finally {
    stream.end();
  }
}

/* ------------------------------ DB Helpers ------------------------------ */

async function withPg(fn) {
  if (!LOAD_DB || !PG_DSN) return;
  const { Client } = await import("pg");
  const client = new Client({ connectionString: PG_DSN });
  await client.connect();
  try {
    await fn(client);
  } finally {
    await client.end();
  }
}

const jf = (v) => (v == null ? null : JSON.stringify(v));
const toStr = (v) => (v == null ? null : String(v));

const numOrNull = (v) => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

const safeDateFromYYYYMMDD = (s) => {
  if (!s || typeof s !== "string") return null;
  const iso = s.replace(/\//g, "-") + "T00:00:00Z";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/* ----------------------------- DB Upserts ----------------------------- */

async function upsertMetaTables(client, { types, subtypes, supertypes, rarities }) {
  await client.query("BEGIN");
  try {
    await client.query("TRUNCATE TABLE tcg_types");
    await client.query("TRUNCATE TABLE tcg_subtypes");
    await client.query("TRUNCATE TABLE tcg_supertypes");
    await client.query("TRUNCATE TABLE tcg_rarities");

    const ins = async (table, names) => {
      if (!names.length) return;
      const values = names.map((_, i) => `($${i + 1})`).join(",");
      await client.query(`INSERT INTO ${table} (name) VALUES ${values}`, names);
    };

    await ins("tcg_types", types);
    await ins("tcg_subtypes", subtypes);
    await ins("tcg_supertypes", supertypes);
    await ins("tcg_rarities", rarities);

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
  console.log("[db] meta tables refreshed (types/subtypes/supertypes/rarities)");
}

async function upsertSetsFromFile(client, setsFile) {
  if (!fs.existsSync(setsFile)) {
    console.log(`[db] sets file missing: ${setsFile}`);
    return;
  }

  const { createInterface } = await import("node:readline");
  const rl = createInterface({
    input: fs.createReadStream(setsFile, "utf8"),
    crlfDelay: Infinity,
  });

  const batch = [];
  const BATCH_SIZE = 400;

  const flush = async () => {
    if (!batch.length) return;

    const setParams = [];
    const setValues = [];
    let i = 1;

    const setsLegalitiesRows = [];

    for (const s of batch) {
      const legal = s.legalities || {};
      const images = s.images || {};

      setParams.push(
        s.id,
        s.name ?? null,
        s.series ?? null,
        toStr(s.printedTotal),
        toStr(s.total),
        s.ptcgoCode ?? null,
        s.releaseDate ?? null,
        s.updatedAt ?? null,
        images.symbol ?? null,
        images.logo ?? null,
        legal.standard ?? null,
        legal.expanded ?? null,
        legal.unlimited ?? null
      );

      setValues.push(
        `($${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++})`
      );

      for (const [format, legality] of Object.entries(legal)) {
        if (legality) setsLegalitiesRows.push([s.id, format, legality]);
      }
    }

    await client.query("BEGIN");
    try {
      await client.query(
        `
        INSERT INTO tcg_sets
          (id, name, series, printed_total, total, ptcgo_code, release_date, updated_at,
           symbol_url, logo_url, standard, expanded, unlimited)
        VALUES ${setValues.join(",")}
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          series = EXCLUDED.series,
          printed_total = EXCLUDED.printed_total,
          total = EXCLUDED.total,
          ptcgo_code = EXCLUDED.ptcgo_code,
          release_date = EXCLUDED.release_date,
          updated_at = EXCLUDED.updated_at,
          symbol_url = EXCLUDED.symbol_url,
          logo_url = EXCLUDED.logo_url,
          standard = EXCLUDED.standard,
          expanded = EXCLUDED.expanded,
          unlimited = EXCLUDED.unlimited
        `,
        setParams
      );

      const setIds = batch.map((s) => s.id);
      if (setIds.length) {
        const delList = setIds.map((_, idx) => `$${idx + 1}`).join(",");
        await client.query(`DELETE FROM tcg_sets_legalities WHERE set_id IN (${delList})`, setIds);
      }

      if (setsLegalitiesRows.length) {
        const params = setsLegalitiesRows.flat();
        const values = setsLegalitiesRows.map((_, k) => {
          const b = 3 * k;
          return `($${b + 1},$${b + 2},$${b + 3})`;
        });
        await client.query(
          `INSERT INTO tcg_sets_legalities (set_id, format, legality) VALUES ${values.join(",")}`,
          params
        );
      }

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }

    batch.length = 0;
  };

  for await (const line of rl) {
    if (!line.trim()) continue;
    batch.push(JSON.parse(line));
    if (batch.length >= BATCH_SIZE) await flush();
  }
  await flush();

  console.log("[db] upserted sets (+tcg_sets_legalities)");
}

function tcgplayerMarketOrNull(prices, key) {
  const obj = prices?.[key];
  if (!obj) return null;
  const m = obj.market ?? obj.mid ?? obj.low ?? null;
  return m == null ? null : String(m);
}
function tcgplayerMarketNum(prices, key) {
  const obj = prices?.[key];
  if (!obj) return null;
  const m = obj.market ?? obj.mid ?? obj.low ?? null;
  return numOrNull(m);
}

async function upsertCardsFromFile(client, cardsFile) {
  if (!fs.existsSync(cardsFile)) {
    console.log(`[db] cards file missing: ${cardsFile}`);
    return;
  }

  const { createInterface } = await import("node:readline");
  const rl = createInterface({
    input: fs.createReadStream(cardsFile, "utf8"),
    crlfDelay: Infinity,
  });

  const BATCH_SIZE = 200;
  let cardsBatch = [];

  const flush = async () => {
    if (!cardsBatch.length) return;

    const imagesRows = [];
    const cardLegalitiesRows = [];
    const abilitiesRows = [];
    const attacksRows = [];
    const weaknessesRows = [];
    const resistancesRows = [];

    const tcgplayerRows = [];
    const cardmarketRows = [];

    const histTcgRows = [];
    const histCmRows = [];

    const cardParams = [];
    const cardValues = [];
    let i = 1;

    for (const c of cardsBatch) {
      const set = c.set || {};
      const setImages = set.images || {};
      const images = c.images || {};
      const legal = c.legalities || {};
      const anc = c.ancientTrait || {};

      cardParams.push(
        c.id,
        c.name ?? null,
        c.supertype ?? null,
        jf(c.subtypes ?? []),
        c.level ?? null,
        c.hp ?? null,
        jf(c.types ?? []),
        c.evolvesFrom ?? null,
        jf(c.evolvesTo ?? []),
        jf(c.rules ?? []),
        anc.name ?? null,
        anc.text ?? null,
        toStr(c.convertedRetreatCost),
        jf(c.retreatCost ?? []),
        set.id ?? null,
        set.name ?? null,
        set.series ?? null,
        toStr(set.printedTotal),
        toStr(set.total),
        set.ptcgoCode ?? null,
        set.releaseDate ?? null,
        set.updatedAt ?? null,
        setImages.symbol ?? null,
        setImages.logo ?? null,
        c.regulationMark ?? null,
        c.artist ?? null,
        c.rarity ?? null,
        c.flavorText ?? null,
        jf(c.nationalPokedexNumbers ?? []),
        null, // extra
        images.small ?? null,
        images.large ?? null,
        c.tcgplayer?.url ?? null,
        c.tcgplayer?.updatedAt ?? null,
        c.cardmarket?.url ?? null,
        c.cardmarket?.updatedAt ?? null
      );

      cardValues.push(
        `($${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++})`
      );

      if (images.small || images.large) {
        imagesRows.push([c.id, images.small ?? null, images.large ?? null, "pokemontcg"]);
      }

      for (const [format, legality] of Object.entries(legal)) {
        if (legality) cardLegalitiesRows.push([c.id, format, legality]);
      }

      if (Array.isArray(c.abilities)) {
        c.abilities.forEach((a, idx) => {
          abilitiesRows.push([c.id, a?.name ?? null, a?.text ?? null, a?.type ?? null, String(idx)]);
        });
      }

      if (Array.isArray(c.attacks)) {
        c.attacks.forEach((a, idx) => {
          attacksRows.push([
            c.id,
            String(idx),
            a?.name ?? null,
            a?.text ?? null,
            a?.damage ?? null,
            toStr(a?.convertedEnergyCost),
            jf(a?.cost ?? []),
          ]);
        });
      }

      if (Array.isArray(c.weaknesses)) {
        c.weaknesses.forEach((w, idx) =>
          weaknessesRows.push([c.id, w?.type ?? null, w?.value ?? null, String(idx)])
        );
      }
      if (Array.isArray(c.resistances)) {
        c.resistances.forEach((r, idx) =>
          resistancesRows.push([c.id, r?.type ?? null, r?.value ?? null, String(idx)])
        );
      }

      if (c.tcgplayer) {
        const prices = c.tcgplayer.prices || {};
        tcgplayerRows.push([
          c.id,
          c.tcgplayer.url ?? null,
          c.tcgplayer.updatedAt ?? null,
          tcgplayerMarketOrNull(prices, "normal"),
          tcgplayerMarketOrNull(prices, "holofoil"),
          tcgplayerMarketOrNull(prices, "reverseHolofoil"),
          tcgplayerMarketOrNull(prices, "1stEditionHolofoil"),
          tcgplayerMarketOrNull(prices, "1stEditionNormal"),
          "USD",
        ]);

        if (LOAD_HISTORY) {
          histTcgRows.push([
            c.id,
            safeDateFromYYYYMMDD(c.tcgplayer.updatedAt ?? null),
            "USD",
            tcgplayerMarketNum(prices, "normal"),
            tcgplayerMarketNum(prices, "holofoil"),
            tcgplayerMarketNum(prices, "reverseHolofoil"),
            tcgplayerMarketNum(prices, "1stEditionHolofoil"),
            tcgplayerMarketNum(prices, "1stEditionNormal"),
          ]);
        }
      }

      if (c.cardmarket) {
        const p = c.cardmarket.prices || {};
        cardmarketRows.push([
          c.id,
          c.cardmarket.url ?? null,
          c.cardmarket.updatedAt ?? null,
          toStr(p.averageSellPrice),
          toStr(p.lowPrice),
          toStr(p.trendPrice),
          toStr(p.germanProLow),
          toStr(p.suggestedPrice),
          toStr(p.reverseHoloSell),
          toStr(p.reverseHoloLow),
          toStr(p.reverseHoloTrend),
          toStr(p.lowPriceExPlus),
          toStr(p.avg1),
          toStr(p.avg7),
          toStr(p.avg30),
          toStr(p.reverseHoloAvg1),
          toStr(p.reverseHoloAvg7),
          toStr(p.reverseHoloAvg30),
        ]);

        if (LOAD_HISTORY) {
          histCmRows.push([
            c.id,
            safeDateFromYYYYMMDD(c.cardmarket.updatedAt ?? null),
            numOrNull(p.averageSellPrice),
            numOrNull(p.lowPrice),
            numOrNull(p.trendPrice),
            numOrNull(p.germanProLow),
            numOrNull(p.suggestedPrice),
            numOrNull(p.reverseHoloSell),
            numOrNull(p.reverseHoloLow),
            numOrNull(p.reverseHoloTrend),
            numOrNull(p.lowPriceExPlus),
            numOrNull(p.avg1),
            numOrNull(p.avg7),
            numOrNull(p.avg30),
            numOrNull(p.reverseHoloAvg1),
            numOrNull(p.reverseHoloAvg7),
            numOrNull(p.reverseHoloAvg30),
          ]);
        }
      }
    }

    await client.query("BEGIN");
    try {
      await client.query(
        `
        INSERT INTO tcg_cards
          (id, name, supertype, subtypes, level, hp, types, evolves_from, evolves_to, rules,
           ancient_trait_name, ancient_trait_text, converted_retreat_cost, retreat_cost,
           set_id, set_name, series, printed_total, total, ptcgo_code, release_date, set_updated_at,
           symbol_url, logo_url, regulation_mark, artist, rarity, flavor_text,
           national_pokedex_numbers, extra, small_image, large_image,
           tcgplayer_url, tcgplayer_updated_at, cardmarket_url, cardmarket_updated_at)
        VALUES ${cardValues.join(",")}
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          supertype = EXCLUDED.supertype,
          subtypes = EXCLUDED.subtypes,
          level = EXCLUDED.level,
          hp = EXCLUDED.hp,
          types = EXCLUDED.types,
          evolves_from = EXCLUDED.evolves_from,
          evolves_to = EXCLUDED.evolves_to,
          rules = EXCLUDED.rules,
          ancient_trait_name = EXCLUDED.ancient_trait_name,
          ancient_trait_text = EXCLUDED.ancient_trait_text,
          converted_retreat_cost = EXCLUDED.converted_retreat_cost,
          retreat_cost = EXCLUDED.retreat_cost,
          set_id = EXCLUDED.set_id,
          set_name = EXCLUDED.set_name,
          series = EXCLUDED.series,
          printed_total = EXCLUDED.printed_total,
          total = EXCLUDED.total,
          ptcgo_code = EXCLUDED.ptcgo_code,
          release_date = EXCLUDED.release_date,
          set_updated_at = EXCLUDED.set_updated_at,
          symbol_url = EXCLUDED.symbol_url,
          logo_url = EXCLUDED.logo_url,
          regulation_mark = EXCLUDED.regulation_mark,
          artist = EXCLUDED.artist,
          rarity = EXCLUDED.rarity,
          flavor_text = EXCLUDED.flavor_text,
          national_pokedex_numbers = EXCLUDED.national_pokedex_numbers,
          extra = EXCLUDED.extra,
          small_image = EXCLUDED.small_image,
          large_image = EXCLUDED.large_image,
          tcgplayer_url = EXCLUDED.tcgplayer_url,
          tcgplayer_updated_at = EXCLUDED.tcgplayer_updated_at,
          cardmarket_url = EXCLUDED.cardmarket_url,
          cardmarket_updated_at = EXCLUDED.cardmarket_updated_at
        `,
        cardParams
      );

      const ids = cardsBatch.map((c) => c.id);
      if (ids.length) {
        const del = ids.map((_, idx) => `$${idx + 1}`).join(",");
        await client.query(`DELETE FROM tcg_card_images WHERE card_id IN (${del})`, ids);
        await client.query(`DELETE FROM tcg_card_legalities WHERE card_id IN (${del})`, ids);
        await client.query(`DELETE FROM tcg_card_abilities WHERE card_id IN (${del})`, ids);
        await client.query(`DELETE FROM tcg_card_attacks WHERE card_id IN (${del})`, ids);
        await client.query(`DELETE FROM tcg_card_weaknesses WHERE card_id IN (${del})`, ids);
        await client.query(`DELETE FROM tcg_card_resistances WHERE card_id IN (${del})`, ids);
        await client.query(`DELETE FROM tcg_card_prices_tcgplayer WHERE card_id IN (${del})`, ids);
        await client.query(`DELETE FROM tcg_card_prices_cardmarket WHERE card_id IN (${del})`, ids);
      }

      if (imagesRows.length) {
        const params = imagesRows.flat();
        const values = imagesRows.map((_, k) => {
          const b = 4 * k;
          return `($${b + 1},$${b + 2},$${b + 3},$${b + 4})`;
        });
        await client.query(
          `INSERT INTO tcg_card_images (card_id, small, large, source) VALUES ${values.join(",")}`,
          params
        );
      }

      if (cardLegalitiesRows.length) {
        const params = cardLegalitiesRows.flat();
        const values = cardLegalitiesRows.map((_, k) => {
          const b = 3 * k;
          return `($${b + 1},$${b + 2},$${b + 3})`;
        });
        await client.query(
          `INSERT INTO tcg_card_legalities (card_id, format, legality) VALUES ${values.join(",")}`,
          params
        );
      }

      if (abilitiesRows.length) {
        const params = abilitiesRows.flat();
        const values = abilitiesRows.map((_, k) => {
          const b = 5 * k;
          return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5})`;
        });
        await client.query(
          `INSERT INTO tcg_card_abilities (card_id, name, text, type, slot) VALUES ${values.join(",")}`,
          params
        );
      }

      if (attacksRows.length) {
        const params = attacksRows.flat();
        const values = attacksRows.map((_, k) => {
          const b = 7 * k;
          return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`;
        });
        await client.query(
          `INSERT INTO tcg_card_attacks (card_id, slot, name, text, damage, converted_energy_cost, cost)
           VALUES ${values.join(",")}`,
          params
        );
      }

      if (weaknessesRows.length) {
        const params = weaknessesRows.flat();
        const values = weaknessesRows.map((_, k) => {
          const b = 4 * k;
          return `($${b + 1},$${b + 2},$${b + 3},$${b + 4})`;
        });
        await client.query(
          `INSERT INTO tcg_card_weaknesses (card_id, type, value, slot) VALUES ${values.join(",")}`,
          params
        );
      }

      if (resistancesRows.length) {
        const params = resistancesRows.flat();
        const values = resistancesRows.map((_, k) => {
          const b = 4 * k;
          return `($${b + 1},$${b + 2},$${b + 3},$${b + 4})`;
        });
        await client.query(
          `INSERT INTO tcg_card_resistances (card_id, type, value, slot) VALUES ${values.join(",")}`,
          params
        );
      }

      if (tcgplayerRows.length) {
        const params = tcgplayerRows.flat();
        const values = tcgplayerRows.map((_, k) => {
          const b = 9 * k;
          return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9})`;
        });
        await client.query(
          `INSERT INTO tcg_card_prices_tcgplayer
           (card_id, url, updated_at, normal, holofoil, reverse_holofoil, first_edition_holofoil, first_edition_normal, currency)
           VALUES ${values.join(",")}`,
          params
        );
      }

      if (cardmarketRows.length) {
        const params = cardmarketRows.flat();
        const values = cardmarketRows.map((_, k) => {
          const b = 18 * k;
          return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},$${b + 14},$${b + 15},$${b + 16},$${b + 17},$${b + 18})`;
        });
        await client.query(
          `INSERT INTO tcg_card_prices_cardmarket
           (card_id, url, updated_at, average_sell_price, low_price, trend_price, german_pro_low, suggested_price,
            reverse_holo_sell, reverse_holo_low, reverse_holo_trend, low_price_ex_plus,
            avg1, avg7, avg30, reverse_holo_avg1, reverse_holo_avg7, reverse_holo_avg30)
           VALUES ${values.join(",")}`,
          params
        );
      }

      if (LOAD_HISTORY && histTcgRows.length) {
        const params = histTcgRows.flat();
        const values = histTcgRows.map((_, k) => {
          const b = 8 * k;
          return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8})`;
        });
        await client.query(
          `INSERT INTO tcg_card_prices_tcgplayer_history
           (card_id, source_updated_at, currency, normal, holofoil, reverse_holofoil, first_edition_holofoil, first_edition_normal)
           VALUES ${values.join(",")}`,
          params
        );
      }

      if (LOAD_HISTORY && histCmRows.length) {
        const params = histCmRows.flat();
        const values = histCmRows.map((_, k) => {
          const b = 17 * k;
          return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},$${b + 14},$${b + 15},$${b + 16},$${b + 17})`;
        });
        await client.query(
          `INSERT INTO tcg_card_prices_cardmarket_history
           (card_id, source_updated_at, average_sell_price, low_price, trend_price, german_pro_low, suggested_price,
            reverse_holo_sell, reverse_holo_low, reverse_holo_trend, low_price_ex_plus,
            avg1, avg7, avg30, reverse_holo_avg1, reverse_holo_avg7, reverse_holo_avg30)
           VALUES ${values.join(",")}`,
          params
        );
      }

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }

    cardsBatch = [];
  };

  let batchCount = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    cardsBatch.push(JSON.parse(line));
    if (cardsBatch.length >= BATCH_SIZE) {
      await flush();
      batchCount++;
      if (batchCount % 10 === 0) console.log(`[db] upserted ~${batchCount * BATCH_SIZE} cards so far…`);
    }
  }
  await flush();

  console.log("[db] upserted cards + nested tables (+history if enabled)");
}

/* --------------------------------- Main --------------------------------- */

async function main() {
  await ensureDir(OUT_DIR);

  const files = {
    cards: path.join(OUT_DIR, "cards.jsonl"),
    sets: path.join(OUT_DIR, "sets.jsonl"),
    types: path.join(OUT_DIR, "types.json"),
    subtypes: path.join(OUT_DIR, "subtypes.json"),
    supertypes: path.join(OUT_DIR, "supertypes.json"),
    rarities: path.join(OUT_DIR, "rarities.json"),
  };

  let meta = null;

  if (!SKIP_FETCH) {
    console.log(`Fetch mode. pageSize=${MAX_PAGE_SIZE} delay=${PAGE_DELAY_MS}ms retries=${MAX_RETRIES}`);
    if (RESET_CHECKPOINT) {
      console.log("Resetting checkpoint…");
      await fsp.rm(CHECKPOINT_FILE, { force: true });
    }

    console.log("Fetching meta lists…");
    meta = await fetchMetaLists();
    await fsp.writeFile(files.types, JSON.stringify(meta.types, null, 2));
    await fsp.writeFile(files.subtypes, JSON.stringify(meta.subtypes, null, 2));
    await fsp.writeFile(files.supertypes, JSON.stringify(meta.supertypes, null, 2));
    await fsp.writeFile(files.rarities, JSON.stringify(meta.rarities, null, 2));
    console.log("Saved meta lists.");

    console.log("Fetching sets… (resumable)");
    await fetchPaged("sets", files.sets);

    console.log("Fetching cards… (long one, resumable)");
    await fetchPaged("cards", files.cards);
  } else {
    console.log("Skipping fetch (--db-only/--skip-fetch). Will load DB from existing JSON/JSONL files.");

    const readJsonIfExists = async (p) => {
      if (!fs.existsSync(p)) return [];
      const txt = await fsp.readFile(p, "utf8");
      return JSON.parse(txt);
    };

    meta = {
      types: await readJsonIfExists(files.types),
      subtypes: await readJsonIfExists(files.subtypes),
      supertypes: await readJsonIfExists(files.supertypes),
      rarities: await readJsonIfExists(files.rarities),
    };

    if (!fs.existsSync(files.sets) || !fs.existsSync(files.cards)) {
      throw new Error(
        `--db-only requires existing JSONL files:\n` +
          `  missing? ${!fs.existsSync(files.sets) ? files.sets : ""}\n` +
          `  missing? ${!fs.existsSync(files.cards) ? files.cards : ""}\n`
      );
    }
  }

  if (LOAD_DB && PG_DSN) {
    console.log("DB load enabled — writing to Postgres…");
    await withPg(async (client) => {
      await upsertMetaTables(client, meta);
      await upsertSetsFromFile(client, files.sets);
      await upsertCardsFromFile(client, files.cards);
    });
    console.log("DB load complete.");
  } else {
    if (!LOAD_DB) console.log("Skipping DB load (set LOAD_DB=true to enable).");
    if (!PG_DSN) console.log("No PG_DSN/DATABASE_URL provided, DB load disabled.");
  }

  console.log("All done ✅");
  if (!dotenvLoaded) console.log("(Tip) Install dotenv and use a .env for POKEMON_TCG_API_KEY / PG_DSN.");
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
