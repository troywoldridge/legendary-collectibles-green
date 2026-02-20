#!/usr/bin/env node
/**
 * scripts/pokemontcg/pokemontcg_fill_tcgdex_missing_prices.mjs
 *
 * Fill missing pricing blocks in public.tcgdex_cards.raw_json using pokemontcg.io.
 *
 * Key behavior:
 *  - Normalize tcgdex set names (Macdonald's -> McDonald's)
 *  - Treat search 404 as "no hits"
 *  - Force-encode apostrophes (%27)
 *  - Skip Pokémon TCG Pocket ids/sets (A1-###, Genetic Apex)
 *  - ✅ Robust set.id resolution:
 *      - exact match on /sets?q=name:"<setName>"
 *      - fallback: fetch ALL sets via pagination and best-match locally (no query syntax reliance)
 */

import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { Pool } from "pg";

// sourcery skip: use-object-destructuring
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("Missing DATABASE_URL");

const API_KEY = process.env.POKEMONTCG_API_KEY;
if (!API_KEY) throw new Error("Missing POKEMONTCG_API_KEY");

const BASE_URL = (process.env.POKEMONTCG_BASE_URL || "https://api.pokemontcg.io/v2").replace(/\/+$/, "");

const LIMIT = clampInt(process.env.LIMIT, 500, 1, 5000);
const CONCURRENCY = clampInt(process.env.CONCURRENCY, 6, 1, 20);
const DRY_RUN = toBool(process.env.DRY_RUN);
const TIMEOUT_MS = clampInt(process.env.TIMEOUT_MS, 20000, 1000, 120000);
const MAX_RETRIES = clampInt(process.env.MAX_RETRIES, 4, 0, 10);
const RETRY_BASE_DELAY_MS = clampInt(process.env.RETRY_BASE_DELAY_MS, 350, 50, 5000);

const FALLBACK_SEARCH = toBool(process.env.FALLBACK_SEARCH);
const FALLBACK_PAGE_SIZE = clampInt(process.env.FALLBACK_PAGE_SIZE, 10, 1, 250);

// Sets pagination (for "fetch all sets" fallback)
const SETS_PAGE_SIZE = clampInt(process.env.SETS_PAGE_SIZE, 250, 50, 250);
const SETS_MAX_PAGES = clampInt(process.env.SETS_MAX_PAGES, 25, 1, 200);

const DEBUG_SAMPLE = clampInt(process.env.DEBUG_SAMPLE, 0, 0, 500);

function clampInt(v, fallback, min, max) {
  const n = Number(String(v ?? ""));
  if (!Number.isFinite(n)) return fallback;
  const m = Math.floor(n);
  if (m < min) return fallback;
  return Math.min(m, max);
}

function toBool(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function isObj(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

function decodeOnce(id) {
  const s = String(id ?? "").trim();
  if (!s) return "";
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function isValidPokemonTcgId(id) {
  const s = String(id ?? "").trim();
  if (!s) return false;
  if (s.includes("%") || s.includes("?") || /\s/.test(s)) return false;
  return /^[a-z0-9-]+$/i.test(s);
}

function stripLeadingYearFromId(id) {
  const s = String(id ?? "").trim();
  const m = s.match(/^(\d{4})([a-z]+[a-z0-9]*-\d.*)$/i);
  if (!m) return null;
  return m[2] || null;
}

function looksLikePocket(raw, idRaw) {
  const setName = String(raw?.set?.name ?? "").trim().toLowerCase();
  const setId = String(raw?.set?.id ?? "").trim().toLowerCase();
  const id = String(idRaw ?? "").trim();

  if (/^A\d+-\d+/i.test(id)) return true;
  if (setName === "genetic apex") return true;
  if (setId === "a1") return true;

  return false;
}

function hasAnyTcgplayerPricingBlock(raw) {
  const tp = raw?.pricing?.tcgplayer;
  if (!isObj(tp)) return false;

  for (const k of Object.keys(tp)) {
    if (k === "unit" || k === "updated" || k === "_sources") continue;
    const o = tp[k];
    if (!isObj(o)) continue;
    for (const p of ["marketPrice", "midPrice", "lowPrice", "highPrice", "directLowPrice"]) {
      const n = o[p];
      if (typeof n === "number" && Number.isFinite(n) && n > 0) return true;
    }
  }
  return false;
}

function mapFinishKeyToTcgdexKey(k) {
  const s = String(k ?? "").trim();
  if (!s) return null;

  if (s === "normal") return "normal";
  if (s === "holofoil") return "holofoil";
  if (s === "reverseHolofoil") return "reverse-holofoil";
  if (s === "1stEditionHolofoil") return "1st-edition-holofoil";
  if (s === "1stEditionNormal") return "1st-edition-normal";

  return s;
}

function numOrNull(v) {
  const n = typeof v === "number" ? v : Number(String(v ?? ""));
  return Number.isFinite(n) ? n : null;
}

function normalizeTcgplayerToTcgdexShape(card) {
  const tp = card?.tcgplayer;
  if (!isObj(tp)) return null;

  const updated = tp?.updatedAt ? String(tp.updatedAt).trim() : null;
  const prices = tp?.prices;
  if (!isObj(prices)) return null;

  const out = { unit: "USD", updated: updated || null };

  for (const [finishKey, priceObj] of Object.entries(prices)) {
    if (!isObj(priceObj)) continue;

    const tcgdexKey = mapFinishKeyToTcgdexKey(finishKey);
    if (!tcgdexKey) continue;

    const marketPrice = numOrNull(priceObj.market);
    const lowPrice = numOrNull(priceObj.low);
    const midPrice = numOrNull(priceObj.mid);
    const highPrice = numOrNull(priceObj.high);
    const directLowPrice = numOrNull(priceObj.directLow);

    if ([marketPrice, lowPrice, midPrice, highPrice, directLowPrice].every((x) => x == null)) continue;

    out[tcgdexKey] = { marketPrice, lowPrice, midPrice, highPrice, directLowPrice };
  }

  const keys = Object.keys(out).filter((k) => k !== "unit" && k !== "updated");
  if (!keys.length) return null;

  return out;
}

function normalizeCardmarketToStore(card) {
  const cm = card?.cardmarket;
  if (!isObj(cm)) return null;

  const updated = cm?.updatedAt ? String(cm.updatedAt).trim() : null;
  return { unit: "EUR", updated: updated || null, ...cm };
}

function isRetryableStatus(status) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

async function fetchWithTimeout(url, opts) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...opts, signal: ac.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

async function fetchPokemonTcgIoJson(pathOrUrl, { allow404 = false } = {}) {
  const url = /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : `${BASE_URL}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res;
    try {
      res = await fetchWithTimeout(url, {
        headers: { "X-Api-Key": API_KEY, Accept: "application/json" },
      });
    } catch (e) {
      const name = String(e?.name || "");
      const msg = String(e?.message || e);
      const retryable = name === "AbortError" || /aborted/i.test(msg) || /timeout/i.test(msg);
      if (retryable && attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await sleep(delay);
        continue;
      }
      const err = new Error(`fetch failed: ${name || "Error"} ${msg}`);
      err._retryable = retryable;
      throw err;
    }

    if (allow404 && res.status === 404) return { status: 404, json: null, url };

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const msg = `pokemontcg.io ${res.status} url=${url} body=${text.slice(0, 180)}`;
      if (isRetryableStatus(res.status) && attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await sleep(delay);
        continue;
      }
      const err = new Error(msg);
      err._status = res.status;
      throw err;
    }

    const json = await res.json();
    return { status: 200, json, url, retried: attempt };
  }

  return { status: 599, json: null, url, retried: MAX_RETRIES };
}

async function fetchPokemonTcgIoCardById(cardId) {
  const { status, json, retried, url } = await fetchPokemonTcgIoJson(`/cards/${encodeURIComponent(cardId)}`, {
    allow404: true,
  });
  const card = json?.data ?? null;
  return { status, card: card && typeof card === "object" ? card : null, retried: retried || 0, url };
}

/* ---------- Query building / normalization ---------- */

function normalizeSetNameForPokemonTcgIo(setName) {
  let s = String(setName ?? "").trim();
  if (!s) return "";

  s = s.replace(/^Macdonald's\b/i, "McDonald's");
  s = s.replace(/^MacDonalds\b/i, "McDonald's");
  s = s.replace(/McDonald’s/g, "McDonald's");

  return s;
}

function luceneEscapePhrase(s) {
  const v = String(s ?? "").trim();
  if (!v) return "";
  return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function encodeQueryParamStrict(s) {
  return encodeURIComponent(String(s ?? "")).replace(/'/g, "%27");
}

function yearFromSetName(setName) {
  const m = String(setName ?? "").match(/\b(19\d{2}|20\d{2})\b/);
  return m ? m[1] : null;
}

function scoreSetCandidate(candidate, wanted) {
  const name = String(candidate?.name ?? "").toLowerCase();
  const want = String(wanted ?? "").toLowerCase();

  let score = 0;

  if (name === want) score += 100;

  if (name.includes("mcdonald")) score += 20;
  if (name.includes("collection")) score += 10;

  const y = yearFromSetName(wanted);
  if (y && name.includes(y)) score += 35;

  // minor similarity bonus
  if (want && name.includes(want.replace(/[^a-z0-9]+/g, " ").trim())) score += 2;

  return score;
}

/**
 * Cache: setName -> setId (pokemontcg.io)
 */
const setIdCache = new Map();

/**
 * Cache: full sets list (fetched once)
 */
let allSetsCache = null;

async function fetchAllSetsOnce() {
  if (allSetsCache) return allSetsCache;

  const out = [];
  for (let page = 1; page <= SETS_MAX_PAGES; page++) {
    const url =
      `${BASE_URL}/sets` +
      `?page=${encodeQueryParamStrict(String(page))}` +
      `&pageSize=${encodeQueryParamStrict(String(SETS_PAGE_SIZE))}` +
      `&select=${encodeQueryParamStrict("id,name,releaseDate")}`;

    const res = await fetchPokemonTcgIoJson(url, { allow404: true });
    const data = res.status === 404 ? [] : res.json?.data;
    const sets = Array.isArray(data) ? data : [];

    if (!sets.length) break;

    out.push(...sets);

    if (sets.length < SETS_PAGE_SIZE) break; // last page
  }

  allSetsCache = out;
  return allSetsCache;
}

/**
 * Resolve pokemontcg.io set.id for a human set name.
 * Strategy:
 *  1) exact phrase search
 *  2) fallback: fetch all sets and best-match locally
 */
async function resolveSetIdByName(setName) {
  const key = String(setName ?? "").trim();
  if (!key) return null;
  if (setIdCache.has(key)) return setIdCache.get(key);

  // 1) exact phrase search
  {
    const q = `name:"${luceneEscapePhrase(key)}"`;
    const url =
      `${BASE_URL}/sets` +
      `?q=${encodeQueryParamStrict(q)}` +
      `&page=1&pageSize=10` +
      `&select=${encodeQueryParamStrict("id,name,releaseDate")}`;

    const res = await fetchPokemonTcgIoJson(url, { allow404: true });
    if (res.status !== 404) {
      const data = res.json?.data;
      const sets = Array.isArray(data) ? data : [];
      const exact =
        sets.find((s) => String(s?.name ?? "").trim().toLowerCase() === key.toLowerCase()) || sets[0] || null;
      const id = exact?.id ? String(exact.id).trim() : null;
      if (id) {
        setIdCache.set(key, id);
        return id;
      }
    }
  }

  // 2) Fetch all sets and fuzzy match locally (query-syntax independent)
  {
    const sets = await fetchAllSetsOnce();

    let best = null;
    let bestScore = -1;

    for (const s of sets) {
      const sc = scoreSetCandidate(s, key);
      if (sc > bestScore) {
        bestScore = sc;
        best = s;
      }
    }

    const id = best?.id ? String(best.id).trim() : null;
    if (id) {
      setIdCache.set(key, id);
      return id;
    }
  }

  setIdCache.set(key, null);
  return null;
}

function buildCardSearchQuery({ setId, setName, number, name }) {
  const parts = [];

  if (setId) parts.push(`set.id:"${luceneEscapePhrase(setId)}"`);
  else if (setName) parts.push(`set.name:"${luceneEscapePhrase(setName)}"`);

  if (number) parts.push(`number:"${luceneEscapePhrase(number)}"`);
  if (name) parts.push(`name:"${luceneEscapePhrase(name)}"`);

  return parts.join(" ");
}

async function searchPokemonTcgIoCards(q) {
  const url =
    `${BASE_URL}/cards` +
    `?q=${encodeQueryParamStrict(q)}` +
    `&page=1` +
    `&pageSize=${encodeQueryParamStrict(String(FALLBACK_PAGE_SIZE))}` +
    `&select=${encodeQueryParamStrict("id,name,number,set.id,set.name,tcgplayer,cardmarket,images")}`;

  const res = await fetchPokemonTcgIoJson(url, { allow404: true });
  if (res.status === 404) return { status: 404, cards: [], retried: res.retried || 0 };

  const arr = res.json?.data;
  return { status: 200, cards: Array.isArray(arr) ? arr : [], retried: res.retried || 0 };
}

function pickBestSearchHit(cards, { name, number, setId, setName }) {
  if (!Array.isArray(cards) || !cards.length) return null;

  const wantName = String(name ?? "").trim().toLowerCase();
  const wantNum = String(number ?? "").trim().toLowerCase();
  const wantSetId = String(setId ?? "").trim().toLowerCase();
  const wantSetName = String(setName ?? "").trim().toLowerCase();

  let best = null;
  let bestScore = -1;

  for (const c of cards) {
    const cName = String(c?.name ?? "").trim().toLowerCase();
    const cNum = String(c?.number ?? "").trim().toLowerCase();
    const cSetId = String(c?.set?.id ?? "").trim().toLowerCase();
    const cSetName = String(c?.set?.name ?? "").trim().toLowerCase();

    let score = 0;
    if (wantNum && cNum === wantNum) score += 8;

    if (wantSetId && cSetId === wantSetId) score += 10;
    else if (wantSetName && cSetName === wantSetName) score += 8;

    if (wantName && cName === wantName) score += 6;
    else if (wantName && cName.includes(wantName)) score += 2;

    if (isObj(c?.tcgplayer) || isObj(c?.cardmarket)) score += 1;

    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }

  return best;
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  const { rows } = await pool.query(
    `
    SELECT id::text AS id
    FROM public.tcgdex_cards
    WHERE raw_json IS NOT NULL
      AND (
        jsonb_typeof(raw_json->'pricing'->'tcgplayer') IS DISTINCT FROM 'object'
        OR jsonb_typeof(raw_json->'pricing'->'cardmarket') IS DISTINCT FROM 'object'
      )
    ORDER BY id ASC
    LIMIT $1
    `,
    [LIMIT]
  );

  const ids = rows.map((r) => String(r.id));

  console.log(
    `[fill] pokemontcg base: ${BASE_URL}\n` +
      `[fill] candidates=${ids.length} limit=${LIMIT} concurrency=${CONCURRENCY} dryRun=${DRY_RUN} timeoutMs=${TIMEOUT_MS} maxRetries=${MAX_RETRIES} fallbackSearch=${FALLBACK_SEARCH}`
  );

  let processed = 0;
  let patched = 0;

  let skippedAlreadyHasPrices = 0;
  let skippedBadId = 0;
  let skippedNoRaw = 0;
  let skippedNonEnglish = 0;
  let skippedPocket = 0;

  let skippedNoCard = 0;
  let skippedNoPrices = 0;

  let direct404 = 0;

  let fallbackTried = 0;
  let fallbackMissingFields = 0;
  let fallbackSearchHits = 0;
  let fallbackSetIdLookups = 0;
  let fallbackSetIdMissing = 0;
  let fallbackNoHits = 0;

  let retryableFailures = 0;
  let totalRetries = 0;
  let errors = 0;

  let idx = 0;
  let sampleLeft = DEBUG_SAMPLE;

// sourcery skip: avoid-function-declarations-in-blocks
  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= ids.length) return;

      const idRaw = ids[i];
      processed++;

      const idDecoded = decodeOnce(idRaw);
      if (!isValidPokemonTcgId(idDecoded)) {
        skippedBadId++;
        continue;
      }

      try {
        const curRes = await pool.query(
          `SELECT raw_json FROM public.tcgdex_cards WHERE id::text = $1::text LIMIT 1`,
          [idRaw]
        );
        const raw = curRes.rows?.[0]?.raw_json ?? null;

        if (!raw || typeof raw !== "object") {
          skippedNoRaw++;
          continue;
        }

        if (looksLikePocket(raw, idRaw)) {
          skippedPocket++;
          continue;
        }

        if (hasAnyTcgplayerPricingBlock(raw)) {
          skippedAlreadyHasPrices++;
          continue;
        }

        const lang = String(raw?.language ?? "").trim().toLowerCase();
        if (lang && lang !== "en") {
          skippedNonEnglish++;
          continue;
        }

        const name = String(raw?.name ?? "").trim() || null;
        const rawSetName = String(raw?.set?.name ?? "").trim() || null;
        const setName = rawSetName ? normalizeSetNameForPokemonTcgIo(rawSetName) : null;
        const number =
          raw?.localId != null
            ? String(raw.localId).trim()
            : raw?.number != null
              ? String(raw.number).trim()
              : null;

        // 1) Direct fetch by id (+ optional alt)
        let fetchedCard = null;

        const directIds = [idDecoded];
        const alt = stripLeadingYearFromId(idDecoded);
        if (alt && alt !== idDecoded && isValidPokemonTcgId(alt)) directIds.push(alt);

        for (const cid of directIds) {
          const fetched = await fetchPokemonTcgIoCardById(cid);
          totalRetries += fetched.retried || 0;

          if (fetched.status === 404) {
            direct404++;
            continue;
          }
          if (fetched.card) {
            fetchedCard = fetched.card;
            break;
          }
        }

        // 2) Fallback search: resolve set.id then search by set.id
        if (!fetchedCard && FALLBACK_SEARCH) {
          fallbackTried++;

          if (!setName || !number) {
            fallbackMissingFields++;
          } else {
            fallbackSetIdLookups++;
            const setId = await resolveSetIdByName(setName);
            if (!setId) fallbackSetIdMissing++;

            const q = buildCardSearchQuery({ setId, setName: setId ? null : setName, number, name });

            if (sampleLeft > 0) {
              sampleLeft--;
              console.log(
                `[sample] id=${idRaw} decoded=${idDecoded} fields=${JSON.stringify({ name, setName, setId, number })} fbQuery=${q}`
              );
            }

            let searched = await searchPokemonTcgIoCards(q);
            totalRetries += searched.retried || 0;

            // If no hits and we included name, retry without name
            if (!searched.cards.length && name) {
              const q2 = buildCardSearchQuery({ setId, setName: setId ? null : setName, number, name: null });
              searched = await searchPokemonTcgIoCards(q2);
              totalRetries += searched.retried || 0;
            }

            if (!searched.cards.length) fallbackNoHits++;

            const hit = pickBestSearchHit(searched.cards, { name, number, setId, setName });
            if (hit) {
              fallbackSearchHits++;
              fetchedCard = hit;
            }
          }
        }

        if (!fetchedCard) {
          skippedNoCard++;
          continue;
        }

        const tcgplayerBlock = normalizeTcgplayerToTcgdexShape(fetchedCard);
        const cardmarketBlock = normalizeCardmarketToStore(fetchedCard);

        if (!tcgplayerBlock && !cardmarketBlock) {
          skippedNoPrices++;
          continue;
        }

        if (DRY_RUN) {
          patched++;
          continue;
        }

        await pool.query(
          `
          UPDATE public.tcgdex_cards
          SET raw_json =
            jsonb_set(
              jsonb_set(
                COALESCE(raw_json, '{}'::jsonb),
                '{pricing,tcgplayer}',
                CASE
                  WHEN jsonb_typeof(raw_json->'pricing'->'tcgplayer') IS DISTINCT FROM 'object'
                       AND $2::jsonb IS NOT NULL
                    THEN $2::jsonb
                  ELSE raw_json->'pricing'->'tcgplayer'
                END,
                true
              ),
              '{pricing,cardmarket}',
              CASE
                WHEN jsonb_typeof(raw_json->'pricing'->'cardmarket') IS DISTINCT FROM 'object'
                     AND $3::jsonb IS NOT NULL
                  THEN $3::jsonb
                ELSE raw_json->'pricing'->'cardmarket'
              END,
              true
            )
          WHERE id::text = $1::text
          `,
          [
            idRaw,
            tcgplayerBlock ? JSON.stringify(tcgplayerBlock) : null,
            cardmarketBlock ? JSON.stringify(cardmarketBlock) : null,
          ]
        );

        const sources = {};
        if (tcgplayerBlock) sources.tcgplayer = "pokemontcg";
        if (cardmarketBlock) sources.cardmarket = "pokemontcg";
        sources.patchedAt = new Date().toISOString();

        await pool.query(
          `
          UPDATE public.tcgdex_cards
          SET raw_json = jsonb_set(
            raw_json,
            '{pricing,_sources}',
            (
              COALESCE(raw_json->'pricing'->'_sources', '{}'::jsonb)
              || $2::jsonb
            ),
            true
          )
          WHERE id::text = $1::text
          `,
          [idRaw, JSON.stringify(sources)]
        );

        patched++;
      } catch (e) {
        const msg = String(e?.message || e);
        const status = e?._status;

        if (status && isRetryableStatus(status)) retryableFailures++;

        errors++;
        console.error(`[fill] error idRaw=${idRaw} id=${idDecoded} ${msg}`);
        await sleep(120);
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  console.log(
    JSON.stringify(
      {
        ok: errors === 0,
        processed,
        patched,
        skippedAlreadyHasPrices,
        skippedBadId,
        skippedNoRaw,
        skippedNonEnglish,
        skippedPocket,
        skippedNoCard,
        skippedNoPrices,
        direct404,
        fallbackTried,
        fallbackMissingFields,
        fallbackSetIdLookups,
        fallbackSetIdMissing,
        fallbackNoHits,
        fallbackSearchHits,
        retryableFailures,
        totalRetries,
        errors,
      },
      null,
      2
    )
  );

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
