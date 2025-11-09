#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * mtgSyncAll.mjs
 *
 * Fetches MTG meta (types/subtypes/supertypes/formats), sets, and all cards
 * from https://api.magicthegathering.io/v1 and loads into Postgres (Neon).
 *
 * ENV:
 *   LOAD_DB=true
 *   DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
 *   # or PG_DSN=...
 *
 * USAGE:
 *   node scripts/mtgSyncAll.mjs              # download to JSON files only
 *   LOAD_DB=true DATABASE_URL='postgresql://...' node scripts/mtgSyncAll.mjs
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

let dotenvLoaded = false;
try {
  const { config } = await import("dotenv");
  config();
  dotenvLoaded = true;
} catch {}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API = "https://api.magicthegathering.io/v1";
const LOAD_DB = String(process.env.LOAD_DB || "").toLowerCase() === "true";
const PG_DSN = process.env.PG_DSN || process.env.DATABASE_URL || "";

const OUT_DIR = path.resolve(__dirname, "..", "data", "mtg");
const files = {
  sets: path.join(OUT_DIR, "sets.jsonl"),
  cards: path.join(OUT_DIR, "cards.jsonl"),
  types: path.join(OUT_DIR, "types.json"),
  subtypes: path.join(OUT_DIR, "subtypes.json"),
  supertypes: path.join(OUT_DIR, "supertypes.json"),
  formats: path.join(OUT_DIR, "formats.json"),
};

const PAGE_SIZE = 100;
const MAX_RETRIES = 8;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const backoff = (attempt) =>
  Math.min(32000, 500 * 2 ** attempt) + Math.floor(Math.random() * 300);

async function fetchJSON(url, label) {
  for (let a = 0; a <= MAX_RETRIES; a++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (res.status >= 500) {
        const txt = await res.text().catch(() => "");
        if (a === MAX_RETRIES)
          throw new Error(`HTTP ${res.status} after retries: ${txt}`);
        const wait = backoff(a);
        console.warn(`[retry] ${label} -> ${res.status}. Wait ${wait}ms`);
        await sleep(wait);
        continue;
      }
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.statusText}: ${txt}`);
      }
      return await res.json();
    } catch (err) {
      if (a === MAX_RETRIES) throw err;
      const wait = backoff(a);
      console.warn(
        `[retry] ${label} network: ${err?.message || err}. Wait ${wait}ms`
      );
      await sleep(wait);
    }
  }
  throw new Error("unreachable");
}

async function ensureDir(p) {
  await fsp.mkdir(p, { recursive: true });
}
async function writeJSON(p, data) {
  await fsp.writeFile(p, JSON.stringify(data, null, 2));
}
async function appendJSONL(p, items) {
  if (!items?.length) return;
  const lines = items.map((o) => JSON.stringify(o)).join("\n") + "\n";
  await fsp.appendFile(p, lines, "utf8");
}

function jf(v) {
  return v == null ? null : JSON.stringify(v);
}
function toNum(v) {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}
/** Clamp to avoid NUMERIC(6,2) overflow (< 10^4). */
function toNumBounded(v, maxAbs = 9999) {
  const n = toNum(v);
  if (n == null) return null;
  if (!Number.isFinite(n)) return null;
  return Math.abs(n) <= maxAbs ? n : null;
}
function toDateYYYYMMDD(s) {
  if (!s) return null;
  return s; // API gives "YYYY-MM-DD"
}

/* --------------------- DB helpers --------------------- */
async function withPg(fn) {
  if (!LOAD_DB || !PG_DSN) return;
  const { Client } = await import("pg");
  const sslRequired =
    /\bsslmode=require\b/i.test(PG_DSN || "") ||
    String(process.env.PGSSLMODE).toLowerCase() === "require";
  const client = new Client({
    connectionString: PG_DSN,
    ...(sslRequired ? { ssl: { rejectUnauthorized: true } } : {}),
  });
  await client.connect();
  try {
    await fn(client);
  } finally {
    await client.end();
  }
}

/* --------------------- Upserts ------------------------ */

async function upsertMeta(client, { types, subtypes, supertypes, formats }) {
  await client.query("BEGIN");
  try {
    await client.query(`TRUNCATE public.mtg_types`);
    await client.query(`TRUNCATE public.mtg_subtypes`);
    await client.query(`TRUNCATE public.mtg_supertypes`);
    await client.query(`TRUNCATE public.mtg_formats`);

    if (types.length) {
      const vals = types.map((_, i) => `($${i + 1})`).join(",");
      await client.query(
        `INSERT INTO public.mtg_types (name) VALUES ${vals}`,
        types
      );
    }
    if (subtypes.length) {
      const vals = subtypes.map((_, i) => `($${i + 1})`).join(",");
      await client.query(
        `INSERT INTO public.mtg_subtypes (name) VALUES ${vals}`,
        subtypes
      );
    }
    if (supertypes.length) {
      const vals = supertypes.map((_, i) => `($${i + 1})`).join(",");
      await client.query(
        `INSERT INTO public.mtg_supertypes (name) VALUES ${vals}`,
        supertypes
      );
    }
    if (formats.length) {
      const vals = formats.map((_, i) => `($${i + 1})`).join(",");
      await client.query(
        `INSERT INTO public.mtg_formats (name) VALUES ${vals}`,
        formats
      );
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
  console.log("[db] meta lists refreshed");
}

async function upsertSetsFromFile(client, setsFile) {
  if (!fs.existsSync(setsFile)) return;

  const rl = (await import("node:readline")).createInterface({
    input: fs.createReadStream(setsFile, "utf8"),
    crlfDelay: Infinity,
  });

  const batch = [];
  const BATCH_SIZE = 300;

  const flush = async () => {
    if (!batch.length) return;

    const params = [];
    const values = [];
    let i = 1;

    for (const s of batch) {
      params.push(
        s.code ?? null,
        s.name ?? null,
        s.type ?? null,
        s.border ?? null,
        s.mkm_id ?? null,
        s.mkm_name ?? null,
        s.gathererCode ?? null,
        s.oldCode ?? null,
        s.magicCardsInfoCode ?? null,
        toDateYYYYMMDD(s.releaseDate),
        s.block ?? null,
        s.onlineOnly ?? null,
        jf(s.booster ?? null)
      );
      values.push(
        `($${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++})`
      );
    }

    await client.query("BEGIN");
    try {
      await client.query(
        `
        INSERT INTO public.mtg_sets
          (code,name,type,border,mkm_id,mkm_name,gatherer_code,old_code,magic_cards_info_code,
           release_date,block,online_only,booster)
        VALUES ${values.join(",")}
        ON CONFLICT (code) DO UPDATE SET
          name=EXCLUDED.name, type=EXCLUDED.type, border=EXCLUDED.border,
          mkm_id=EXCLUDED.mkm_id, mkm_name=EXCLUDED.mkm_name,
          gatherer_code=EXCLUDED.gatherer_code, old_code=EXCLUDED.old_code,
          magic_cards_info_code=EXCLUDED.magic_cards_info_code,
          release_date=EXCLUDED.release_date, block=EXCLUDED.block,
          online_only=EXCLUDED.online_only, booster=EXCLUDED.booster
        `,
        params
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
    batch.length = 0;
  };

  for await (const line of rl) {
    if (!line.trim()) continue;
    const obj = JSON.parse(line);
    const arr = obj.sets || obj.cards || obj.set || obj; // defensive
    if (Array.isArray(arr)) batch.push(...arr);
    else batch.push(obj);
    if (batch.length >= BATCH_SIZE) await flush();
  }
  await flush();
  console.log("[db] upserted sets");
}

async function upsertCardsFromFile(client, cardsFile) {
  if (!fs.existsSync(cardsFile)) return;

  const rl = (await import("node:readline")).createInterface({
    input: fs.createReadStream(cardsFile, "utf8"),
    crlfDelay: Infinity,
  });

  const BATCH_SIZE = 150;
  let batch = [];

  const flush = async () => {
    if (!batch.length) return;

    const cardParams = [];
    const cardValues = [];
    let i = 1;

    const rulingsRows = [];
    const foreignRows = [];

    for (const c of batch) {
      cardParams.push(
        c.id ?? null,
        c.name ?? null,
        jf(c.names ?? null),
        c.manaCost ?? null,
        toNumBounded(c.cmc, 9999),              // <— FIX: clamp for NUMERIC(6,2)
        jf(c.colors ?? null),
        jf(c.colorIdentity ?? null),
        c.type ?? null,
        jf(c.supertypes ?? null),
        jf(c.types ?? null),
        jf(c.subtypes ?? null),
        c.rarity ?? null,
        c.set ?? null,
        c.text ?? null,
        c.artist ?? null,
        c.number ?? null,
        c.power ?? null,
        c.toughness ?? null,
        c.loyalty ?? null,
        c.layout ?? null,
        Number.isFinite(+c.multiverseid) ? +c.multiverseid : null,
        c.imageUrl ?? null,
        c.originalText ?? null,
        c.originalType ?? null,
        jf(c.printings ?? null),
        null
      );
      // 26 placeholders to match 26 params above
      cardValues.push(
        `($${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++})`
      );

      if (Array.isArray(c.rulings)) {
        for (const r of c.rulings) {
          rulingsRows.push([c.id ?? null, r?.date ? r.date : null, r?.text ?? null]);
        }
      }

      if (Array.isArray(c.foreignNames)) {
        for (const f of c.foreignNames) {
          foreignRows.push([
            c.id ?? null,
            f?.name ?? null,
            f?.language ?? null,
            Number.isFinite(+f?.multiverseid) ? +f.multiverseid : null,
          ]);
        }
      }
    }

    await client.query("BEGIN");
    try {
      // upsert main cards
      await client.query(
        `
        INSERT INTO public.mtg_cards
          (id,name,names,mana_cost,cmc,colors,color_identity,type_line,supertypes,types,subtypes,
           rarity,set_code,text_box,artist,number,power,toughness,loyalty,layout,multiverseid,image_url,
           original_text,original_type,printings,extra)
        VALUES ${cardValues.join(",")}
        ON CONFLICT (id) DO UPDATE SET
          name=EXCLUDED.name, names=EXCLUDED.names, mana_cost=EXCLUDED.mana_cost, cmc=EXCLUDED.cmc,
          colors=EXCLUDED.colors, color_identity=EXCLUDED.color_identity,
          type_line=EXCLUDED.type_line, supertypes=EXCLUDED.supertypes, types=EXCLUDED.types, subtypes=EXCLUDED.subtypes,
          rarity=EXCLUDED.rarity, set_code=EXCLUDED.set_code, text_box=EXCLUDED.text_box, artist=EXCLUDED.artist,
          number=EXCLUDED.number, power=EXCLUDED.power, toughness=EXCLUDED.toughness, loyalty=EXCLUDED.loyalty,
          layout=EXCLUDED.layout, multiverseid=EXCLUDED.multiverseid, image_url=EXCLUDED.image_url,
          original_text=EXCLUDED.original_text, original_type=EXCLUDED.original_type, printings=EXCLUDED.printings,
          extra=EXCLUDED.extra
        `,
        cardParams
      );

      // refresh child rows for these cards
      const ids = batch.map((c) => c.id).filter(Boolean);
      if (ids.length) {
        const list = ids.map((_, k) => `$${k + 1}`).join(",");
        await client.query(
          `DELETE FROM public.mtg_card_rulings WHERE card_id IN (${list})`,
          ids
        );
        await client.query(
          `DELETE FROM public.mtg_card_foreign_names WHERE card_id IN (${list})`,
          ids
        );
      }

      if (rulingsRows.length) {
        const params = rulingsRows.flat();
        const values = rulingsRows.map((_, k) => {
          const b = k * 3;
          return `($${b + 1},$${b + 2},$${b + 3})`;
        });
        await client.query(
          `INSERT INTO public.mtg_card_rulings (card_id, ruling_date, text) VALUES ${values.join(",")}`,
          params
        );
      }

      if (foreignRows.length) {
        const params = foreignRows.flat();
        const values = foreignRows.map((_, k) => {
          const b = k * 4;
          return `($${b + 1},$${b + 2},$${b + 3},$${b + 4})`;
        });
        await client.query(
          `INSERT INTO public.mtg_card_foreign_names (card_id, name, language, multiverseid) VALUES ${values.join(",")}`,
          params
        );
      }

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      // helpful debug
      console.error("[cards] batch failed, first 5 ids:", batch.slice(0, 5).map((x) => x?.id));
      const suspicious = batch
        .filter((x) => {
          const n = toNum(x?.cmc);
          return n != null && Math.abs(n) > 9999;
        })
        .map((x) => ({ id: x?.id, cmc: x?.cmc }));
      if (suspicious.length) console.error("[cards] suspicious cmc:", suspicious.slice(0, 10));
      throw e;
    }

    batch = [];
  };

  for await (const line of rl) {
    if (!line.trim()) continue;
    batch.push(JSON.parse(line));
    if (batch.length >= BATCH_SIZE) {
      await flush();
      console.log("[db] upserted another batch of cards…");
    }
  }
  await flush();
  console.log("[db] upserted cards + rulings + foreign names");
}

/* --------------------- Fetchers ---------------------- */

async function fetchAllSets() {
  let page = 1;
  let wrote = 0;
  await fsp.writeFile(files.sets, "");
  while (true) {
    const url = `${API}/sets?page=${page}&pageSize=${PAGE_SIZE}`;
    const json = await fetchJSON(url, `sets page ${page}`);
    const batch = json.sets || [];
    if (!batch.length) break;
    await appendJSONL(files.sets, batch);
    wrote += batch.length;
    console.log(`[sets] page=${page} (+${batch.length}) total=${wrote}`);
    page++;
    await sleep(120);
  }
}

async function fetchAllCards() {
  let page = 1;
  let wrote = 0;
  await fsp.writeFile(files.cards, "");
  while (true) {
    const url = `${API}/cards?page=${page}&pageSize=${PAGE_SIZE}`;
    const json = await fetchJSON(url, `cards page ${page}`);
    const batch = json.cards || [];
    if (!batch.length) break;
    await appendJSONL(files.cards, batch);
    wrote += batch.length;
    console.log(`[cards] page=${page} (+${batch.length}) total=${wrote}`);
    page++;
    await sleep(200);
  }
}

async function fetchMeta() {
  const [types, subtypes, supertypes, formats] = await Promise.all([
    fetchJSON(`${API}/types`, "types"),
    fetchJSON(`${API}/subtypes`, "subtypes"),
    fetchJSON(`${API}/supertypes`, "supertypes"),
    fetchJSON(`${API}/formats`, "formats"),
  ]);
  const out = {
    types: types?.types ?? [],
    subtypes: subtypes?.subtypes ?? [],
    supertypes: supertypes?.supertypes ?? [],
    formats: formats?.formats ?? [],
  };
  await writeJSON(files.types, out.types);
  await writeJSON(files.subtypes, out.subtypes);
  await writeJSON(files.supertypes, out.supertypes);
  await writeJSON(files.formats, out.formats);
  console.log("[meta] saved types/subtypes/supertypes/formats");
  return out;
}

/* --------------------- Main -------------------------- */

async function main() {
  await ensureDir(OUT_DIR);

  const meta = await fetchMeta();
  await fetchAllSets();
  await fetchAllCards();

  if (LOAD_DB && PG_DSN) {
    await withPg(async (client) => {
      await upsertMeta(client, meta);
      await upsertSetsFromFile(client, files.sets);
      await upsertCardsFromFile(client, files.cards);
    });
    console.log("DB load complete ✅");
  } else {
    if (!LOAD_DB) console.log("Skipping DB load (set LOAD_DB=true to enable).");
    if (!PG_DSN) console.log("No DATABASE_URL/PG_DSN set; DB load disabled.");
  }

  if (!dotenvLoaded)
    console.log("(Tip) pnpm add -D dotenv and use a .env for DATABASE_URL");
}

main().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
