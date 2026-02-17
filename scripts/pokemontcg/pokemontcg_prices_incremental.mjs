#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * scripts/pokemontcg/pokemontcg_prices_incremental.mjs
 *
 * Incremental price refresher using TCGdex v2 API (embedded pricing).
 *
 * NOTE: tcg_card_prices_tcgplayer has UNIQUE (card_id, variant_type)
 * so upserts MUST use ON CONFLICT (card_id, variant_type).
 */

import "dotenv/config";
import pg from "pg";

const { Client } = pg;

const API_BASE = "https://api.tcgdex.net/v2/en";

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      args._.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function usage() {
  console.log(
    `
TCGdex incremental price sync (tcgplayer focused)

Usage:
  node scripts/pokemontcg/pokemontcg_prices_incremental.mjs [options]

Options:
  --date YYYY/MM/DD|YYYY-MM-DD     UTC day to include (default: today UTC)
  --provider tcgplayer|cardmarket|both   default: both
  --variant-type <string>          value to store in tcg_card_prices_tcgplayer.variant_type (default: default)
  --page-size <1..250>             list page size (default: 250)
  --max-pages <n>                  optional safety limit
  --concurrency <1..32>            detail fetch concurrency (default: 8)
  --timeout-ms <ms>                request timeout (default: 120000)
  --batch <n>                      DB flush batch (default: 2000)
  --dry-run                        fetch/transform only, no DB writes
  --help                           show help
`.trim(),
  );
}

function isoUtcDateToYmdSlash(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

function normalizeDateInput(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  const m = value.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (!m) return null;

  const [, y, mo, d] = m;
  const iso = `${y}-${mo}-${d}T00:00:00.000Z`;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  if (dt.toISOString().slice(0, 10) !== `${y}-${mo}-${d}`) return null;

  return `${y}/${mo}/${d}`;
}

function daySlashToIsoStart(ymdSlash) {
  return ymdSlash.replaceAll("/", "-") + "T00:00:00.000Z";
}

function dayStartEpochMs(ymdSlash) {
  const dt = new Date(daySlashToIsoStart(ymdSlash));
  return dt.getTime();
}

function numOrNull(v) {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

class HttpError extends Error {
  constructor(status, statusText, bodySnippet, url) {
    super(`HTTP ${status} ${statusText}: ${bodySnippet}`);
    this.name = "HttpError";
    this.status = status;
    this.statusText = statusText;
    this.bodySnippet = bodySnippet;
    this.url = url;
  }
}

async function fetchJson(url, { maxRetries = 6, label = "", timeoutMs = 120_000 } = {}) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { Accept: "application/json" },
      });

      if (res.status === 429 || res.status >= 500) {
        const txt = await res.text().catch(() => "");
        if (attempt === maxRetries) throw new HttpError(res.status, res.statusText, txt.slice(0, 300), url);
        const ra = Number(res.headers.get("retry-after") || "");
        const wait =
          Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(30_000, 500 * (attempt + 1) ** 2);
        console.warn(`[retry] ${label} -> HTTP ${res.status}. waiting ${wait}ms`);
        await sleep(wait);
        continue;
      }

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new HttpError(res.status, res.statusText, txt.slice(0, 300), url);
      }

      return await res.json();
    } catch (e) {
      const name = String(e?.name || "");
      const msg = String(e?.message || e);
      const aborted = name === "AbortError" || msg.toLowerCase().includes("aborted");

      if (e?.name === "HttpError" && typeof e.status === "number") {
        const s = e.status;
        if (s >= 400 && s < 500 && s !== 429) throw e;
      }

      if (attempt === maxRetries) throw e;

      const wait = aborted ? Math.min(45_000, 1500 * (attempt + 1)) : Math.min(30_000, 500 * (attempt + 1) ** 2);
      console.warn(`[retry] ${label} error: ${msg}. waiting ${wait}ms`);
      await sleep(wait);
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error("unreachable");
}

/* ------------------------ TCGdex endpoints ------------------------ */

function buildCardsListUrl({ page, pageSize }) {
  const qs = new URLSearchParams();
  qs.set("pagination:page", String(page));
  qs.set("pagination:itemsPerPage", String(pageSize));
  return `${API_BASE}/cards?${qs.toString()}`;
}

function buildCardDetailUrl(cardId) {
  return `${API_BASE}/cards/${encodeURIComponent(cardId)}`;
}

function isLikelyValidCardId(id) {
  if (typeof id !== "string") return false;
  const s = id.trim();
  if (!s) return false;
  if (s.length > 80) return false;
  return /^[a-z0-9._-]+$/i.test(s);
}

async function* fetchAllCardIds({ pageSize, maxPages, timeoutMs }) {
  let page = 1;
  while (true) {
    if (maxPages && page > maxPages) return;

    const url = buildCardsListUrl({ page, pageSize });
    const json = await fetchJson(url, { label: `cards list page=${page}`, timeoutMs });

    const arr = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
    const ids = arr.map((x) => x?.id).filter(Boolean);

    yield { page, count: ids.length, ids };

    if (!ids.length) return;
    if (ids.length < pageSize) return;

    page++;
  }
}

async function fetchCardDetail(cardId, timeoutMs) {
  const url = buildCardDetailUrl(cardId);
  return await fetchJson(url, { label: `card ${cardId}`, timeoutMs });
}

/* ------------------------ pricing accessors ------------------------ */

function getPricing(card) {
  const pricing = card?.pricing || {};
  const cardmarket = pricing.cardmarket ?? pricing.cardMarket ?? null;
  const tcgplayer = pricing.tcgplayer ?? null;
  return { cardmarket, tcgplayer };
}

function updatedMsFromProvider(card, provider) {
  const { cardmarket, tcgplayer } = getPricing(card);
  const p = provider === "tcgplayer" ? tcgplayer : cardmarket;
  if (!p) return null;

  const u = p.updated;
  if (typeof u === "number" && Number.isFinite(u)) return u > 10_000_000_000 ? u : u * 1000;
  const dt = new Date(String(u));
  const ms = dt.getTime();
  return Number.isNaN(ms) ? null : ms;
}

function updatedIsoFromProvider(card, provider) {
  const ms = updatedMsFromProvider(card, provider);
  if (ms == null) return null;
  const dt = new Date(ms);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

/* ------------------------ DB write helpers ------------------------ */

async function upsertTcgplayerNow(client, rows) {
  if (!rows.length) return 0;

  // IMPORTANT: now table unique is (card_id, variant_type)
  const cols = 10;
  const params = [];
  const values = rows
    .map((r, idx) => {
      const b = idx * cols;
      params.push(
        r.card_id,
        r.variant_type,
        r.url,
        r.updated_at,
        r.normal,
        r.holofoil,
        r.reverse_holofoil,
        r.first_edition_holofoil,
        r.first_edition_normal,
        r.currency,
      );
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10})`;
    })
    .join(",");

  await client.query(
    `
    INSERT INTO tcg_card_prices_tcgplayer
      (card_id, variant_type, url, updated_at, normal, holofoil, reverse_holofoil, first_edition_holofoil, first_edition_normal, currency)
    VALUES ${values}
    ON CONFLICT (card_id, variant_type) DO UPDATE SET
      url = EXCLUDED.url,
      updated_at = EXCLUDED.updated_at,
      normal = EXCLUDED.normal,
      holofoil = EXCLUDED.holofoil,
      reverse_holofoil = EXCLUDED.reverse_holofoil,
      first_edition_holofoil = EXCLUDED.first_edition_holofoil,
      first_edition_normal = EXCLUDED.first_edition_normal,
      currency = EXCLUDED.currency
    `,
    params,
  );

  return rows.length;
}

async function insertTcgplayerHistory(client, rows) {
  if (!rows.length) return 0;

  const clean = rows.filter((r) => r.card_id && r.source_updated_at);
  if (!clean.length) return 0;

  const cols = 8;
  const params = [];
  const values = clean
    .map((r, idx) => {
      const b = idx * cols;
      params.push(
        r.card_id,
        r.source_updated_at,
        r.currency,
        r.normal,
        r.holofoil,
        r.reverse_holofoil,
        r.first_edition_holofoil,
        r.first_edition_normal,
      );
      return `($${b + 1},$${b + 2}::timestamptz,$${b + 3},$${b + 4}::numeric,$${b + 5}::numeric,$${b + 6}::numeric,$${b + 7}::numeric,$${b + 8}::numeric)`;
    })
    .join(",");

  const res = await client.query(
    `
    INSERT INTO public.tcg_card_prices_tcgplayer_history
      (card_id, source_updated_at, currency, normal, holofoil, reverse_holofoil, first_edition_holofoil, first_edition_normal)
    VALUES ${values}
    ON CONFLICT (card_id, source_updated_at) DO NOTHING
    `,
    params,
  );

  return res.rowCount || 0;
}

/* ------------------------ extraction / mapping ------------------------ */

function pickTcgdxTcgplayerVariant(v) {
  if (!v) return null;
  return v.marketPrice ?? v.midPrice ?? v.lowPrice ?? null;
}

function extractTcgplayerRow(card, variantType) {
  const { tcgplayer } = getPricing(card);
  if (!tcgplayer) return null;

  const normal = pickTcgdxTcgplayerVariant(tcgplayer.normal);
  const holofoil = pickTcgdxTcgplayerVariant(tcgplayer.holofoil);
  const reverse = pickTcgdxTcgplayerVariant(tcgplayer["reverse-holofoil"]);
  const firstNormal = pickTcgdxTcgplayerVariant(tcgplayer["1st-edition"]);
  const firstHolo = pickTcgdxTcgplayerVariant(tcgplayer["1st-edition-holofoil"]);

  return {
    card_id: card.id,
    variant_type: variantType,
    url: null,
    updated_at: updatedIsoFromProvider(card, "tcgplayer"),
    normal: normal == null ? null : String(normal),
    holofoil: holofoil == null ? null : String(holofoil),
    reverse_holofoil: reverse == null ? null : String(reverse),
    first_edition_holofoil: firstHolo == null ? null : String(firstHolo),
    first_edition_normal: firstNormal == null ? null : String(firstNormal),
    currency: String(tcgplayer.unit || "USD"),
  };
}

function extractTcgplayerHistRow(card) {
  const row = extractTcgplayerRow(card, "default");
  if (!row?.updated_at) return null;

  return {
    card_id: row.card_id,
    source_updated_at: row.updated_at,
    currency: row.currency,
    normal: numOrNull(row.normal),
    holofoil: numOrNull(row.holofoil),
    reverse_holofoil: numOrNull(row.reverse_holofoil),
    first_edition_holofoil: numOrNull(row.first_edition_holofoil),
    first_edition_normal: numOrNull(row.first_edition_normal),
  };
}

/* ------------------------ concurrency helper ------------------------ */

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;

  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx], idx);
    }
  }

  const n = Math.max(1, limit);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

/* ------------------------ runner ------------------------ */

async function runAll({ client, providerMode, daySlash, pageSize, maxPages, dryRun, concurrency, timeoutMs, batchSize, variantType }) {
  const dayStart = dayStartEpochMs(daySlash);

  let fetched = 0;
  let upserts = 0;
  let skipped = 0;
  let notFound = 0;
  let badId = 0;
  let errors = 0;

  const tcgNow = [];
  const tcgHist = [];

  const wantsTcg = providerMode === "tcgplayer" || providerMode === "both";
  if (!wantsTcg) throw new Error("This script run expects tcgplayer for now (use --provider tcgplayer)");

  const flush = async () => {
    if (dryRun) {
      console.log(`[dry-run] flush now: tcg_now=${tcgNow.length} tcg_hist=${tcgHist.length}`);
      tcgNow.length = 0;
      tcgHist.length = 0;
      return;
    }

    if (!tcgNow.length && !tcgHist.length) return;

    await client.query("BEGIN");
    try {
      const a = tcgNow.length ? await upsertTcgplayerNow(client, tcgNow) : 0;
      const b = tcgHist.length ? await insertTcgplayerHistory(client, tcgHist) : 0;
      await client.query("COMMIT");
      upserts += a;
      console.log(`[db] flush: tcg_now=${a} tcg_hist+${b}`);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      tcgNow.length = 0;
      tcgHist.length = 0;
    }
  };

  const idBuffer = [];

  const processIdBatch = async (ids) => {
    const results = await mapLimit(ids, concurrency, async (id) => {
      if (!isLikelyValidCardId(id)) {
        badId++;
        return { ok: false, kind: "badId", id };
      }

      try {
        const card = await fetchCardDetail(id, timeoutMs);
        return { ok: true, id, card };
      } catch (e) {
        if (e?.name === "HttpError" && e.status === 404) {
          notFound++;
          return { ok: false, kind: "notFound", id };
        }
        errors++;
        console.warn(`[err] card=${id}: ${e?.message || e}`);
        return { ok: false, kind: "error", id };
      }
    });

    for (const r of results) {
      if (!r?.ok) continue;

      const card = r.card;
      if (!card?.id) continue;

      fetched++;

      let included = false;

      const ms = updatedMsFromProvider(card, "tcgplayer");
      if (ms != null && ms >= dayStart) {
        const row = extractTcgplayerRow(card, variantType);
        const h = extractTcgplayerHistRow(card);
        if (row) tcgNow.push(row);
        if (h) tcgHist.push(h);
        included = true;
      }

      if (!included) skipped++;

      if (tcgNow.length >= batchSize) {
        await flush();
      }
    }
  };

  for await (const page of fetchAllCardIds({ pageSize, maxPages, timeoutMs })) {
    console.log(`[list] page ${page.page}: ids=${page.count}`);
    idBuffer.push(...page.ids);

    while (idBuffer.length >= batchSize) {
      const ids = idBuffer.splice(0, batchSize);
      await processIdBatch(ids);
      console.log(`[progress] fetched=${fetched} upserts=${upserts} skipped=${skipped} notFound=${notFound} badId=${badId} errors=${errors}`);
    }
  }

  while (idBuffer.length) {
    const ids = idBuffer.splice(0, batchSize);
    await processIdBatch(ids);
    console.log(`[progress] fetched=${fetched} upserts=${upserts} skipped=${skipped} notFound=${notFound} badId=${badId} errors=${errors}`);
  }

  await flush();

  console.log(`[done] fetched=${fetched} upserts=${upserts} skipped=${skipped} notFound=${notFound} badId=${badId} errors=${errors}`);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    usage();
    return;
  }

  const daySlash = normalizeDateInput(args.date || "") || isoUtcDateToYmdSlash(new Date());
  const pageSize = Math.max(1, Math.min(250, Number(args["page-size"] || 250) || 250));
  const maxPages = args["max-pages"] ? Math.max(1, Number(args["max-pages"]) || 1) : null;
  const concurrency = Math.max(1, Math.min(32, Number(args.concurrency || 8) || 8));
  const timeoutMs = Math.max(5_000, Number(args["timeout-ms"] || 120_000) || 120_000);
  const batchSize = Math.max(100, Math.min(10_000, Number(args.batch || 2000) || 2000));
  const dryRun = Boolean(args["dry-run"]);

  const providerRaw = String(args.provider || "both").toLowerCase().trim();
  const providerMode = providerRaw === "tcgplayer" || providerRaw === "cardmarket" ? providerRaw : "both";

  const variantType = String(args["variant-type"] || "default").trim() || "default";

  const DATABASE_URL = process.env.DATABASE_URL || "";
  if (!DATABASE_URL && !dryRun) throw new Error("Missing DATABASE_URL in env (or use --dry-run)");

  console.log(
    `[prices] provider=tcgdex day=${daySlash} providerMode=${providerMode} pageSize=${pageSize} dryRun=${dryRun} concurrency=${concurrency} timeoutMs=${timeoutMs} batch=${batchSize} variantType=${variantType}`,
  );

  const client = dryRun ? null : new Client({ connectionString: DATABASE_URL });
  if (client) await client.connect();

  try {
    await runAll({ client, providerMode, daySlash, pageSize, maxPages, dryRun, concurrency, timeoutMs, batchSize, variantType });
  } finally {
    if (client) await client.end();
  }
}

main().catch((err) => {
  console.error("Failed:", err?.stack || err?.message || String(err));
  process.exit(1);
});
