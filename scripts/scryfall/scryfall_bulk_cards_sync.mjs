#!/usr/bin/env node
/**
 * Scryfall Bulk Cards Sync — streams bulk JSON and UPSERTS into public.scryfall_cards_raw
 *
 * Batch-commit version (more resilient + usually faster).
 *
 * Usage:
 *  node scripts/scryfall/scryfall_bulk_cards_sync.mjs \
 *    --type default_cards \
 *    --db-url "$DATABASE_URL" \
 *    --out-dir ./out/scryfall/bulk \
 *    --batch 500 \
 *    --force
 *
 * Optional speed:
 *  --fast   (sets synchronous_commit=off per batch)
 */

import fs from "fs";
import path from "path";
import zlib from "zlib";
import { pipeline } from "stream/promises";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) args[key] = true;
      else {
        args[key] = next;
        i++;
      }
    } else args._.push(a);
  }
  return args;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, obj) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf8");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function pickIndexColumns(card) {
  return {
    id: card.id,
    oracle_id: card.oracle_id || null,
    lang: card.lang || "en",
    name: card.name || "",
    layout: card.layout || null,

    set_code: card.set || null,
    set_id: card.set_id || null,
    collector_number: card.collector_number || null,
    released_at: card.released_at || null,

    arena_id: card.arena_id ?? null,
    mtgo_id: card.mtgo_id ?? null,
    mtgo_foil_id: card.mtgo_foil_id ?? null,
    tcgplayer_id: card.tcgplayer_id ?? null,
    tcgplayer_etched_id: card.tcgplayer_etched_id ?? null,
    cardmarket_id: card.cardmarket_id ?? null,
  };
}

async function fetchJson(url, { maxRetries = 6 } = {}) {
  const headers = {
    Accept: "application/json",
    "User-Agent": "legendary-collectibles-scryfall-bulk/1.0 (local-script)",
  };

  let attempt = 0;
  while (true) {
    attempt++;
    const res = await fetch(url, { headers });
    const text = await res.text();

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      if (!res.ok && attempt <= maxRetries) {
        const wait = Math.min(1500 * attempt, 8000);
        console.warn(`[bulk] Non-JSON body (HTTP ${res.status}). Retry in ${wait}ms...`);
        await sleep(wait);
        continue;
      }
      throw new Error(`Failed to parse JSON from ${url} (HTTP ${res.status})`);
    }

    if (res.ok) return json;

    const details = json?.details || text.slice(0, 300);
    if ((res.status === 429 || res.status >= 500) && attempt <= maxRetries) {
      const retryAfter = Number(res.headers.get("retry-after") || "");
      const wait = Number.isFinite(retryAfter) ? retryAfter * 1000 : Math.min(1500 * attempt, 8000);
      console.warn(`[bulk] HTTP ${res.status}: ${details} — retry in ${wait}ms`);
      await sleep(wait);
      continue;
    }

    throw new Error(`HTTP ${res.status} from ${url}: ${details}`);
  }
}

async function getBulkItem(type) {
  const data = await fetchJson("https://api.scryfall.com/bulk-data");
  if (!data || data.object !== "list" || !Array.isArray(data.data)) {
    throw new Error("Unexpected response from /bulk-data");
  }
  const item = data.data.find((x) => x.type === type);
  if (!item) {
    const types = data.data.map((x) => x.type).join(", ");
    throw new Error(`Bulk type "${type}" not found. Available: ${types}`);
  }
  return item;
}

function getDbUrl(args) {
  return (args["db-url"] && String(args["db-url"]).trim()) || process.env.DATABASE_URL || null;
}

async function getDbClient(dbUrl) {
  const pg = await import("pg");
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  return client;
}

/**
 * IMPORTANT:
 * - Your table columns exactly match this insert order.
 * - We update fetched_at + updated_at on conflict so "last seen" stays correct.
 */
function buildUpsertSql(rowCount) {
  const cols = [
    "id",
    "oracle_id",
    "lang",
    "name",
    "layout",
    "set_code",
    "set_id",
    "collector_number",
    "released_at",
    "arena_id",
    "mtgo_id",
    "mtgo_foil_id",
    "tcgplayer_id",
    "tcgplayer_etched_id",
    "cardmarket_id",
    "payload",
  ];

  const values = [];
  let p = 1;

  for (let i = 0; i < rowCount; i++) {
    const tuple = [];
    for (let j = 0; j < cols.length; j++) tuple.push(`$${p++}`);
    values.push(`(${tuple.join(",")}, NOW(), NOW())`);
  }

  return `
    INSERT INTO public.scryfall_cards_raw (
      id, oracle_id, lang, name, layout,
      set_code, set_id, collector_number, released_at,
      arena_id, mtgo_id, mtgo_foil_id, tcgplayer_id, tcgplayer_etched_id, cardmarket_id,
      payload, fetched_at, updated_at
    )
    VALUES ${values.join(",\n")}
    ON CONFLICT (id) DO UPDATE SET
      oracle_id = EXCLUDED.oracle_id,
      lang = EXCLUDED.lang,
      name = EXCLUDED.name,
      layout = EXCLUDED.layout,
      set_code = EXCLUDED.set_code,
      set_id = EXCLUDED.set_id,
      collector_number = EXCLUDED.collector_number,
      released_at = EXCLUDED.released_at,
      arena_id = EXCLUDED.arena_id,
      mtgo_id = EXCLUDED.mtgo_id,
      mtgo_foil_id = EXCLUDED.mtgo_foil_id,
      tcgplayer_id = EXCLUDED.tcgplayer_id,
      tcgplayer_etched_id = EXCLUDED.tcgplayer_etched_id,
      cardmarket_id = EXCLUDED.cardmarket_id,
      payload = EXCLUDED.payload,
      fetched_at = NOW(),
      updated_at = NOW()
  `;
}

function batchParams(cards) {
  const params = [];
  for (const card of cards) {
    const idx = pickIndexColumns(card);
    params.push(
      idx.id,
      idx.oracle_id,
      idx.lang,
      idx.name,
      idx.layout,
      idx.set_code,
      idx.set_id,
      idx.collector_number,
      idx.released_at,
      idx.arena_id,
      idx.mtgo_id,
      idx.mtgo_foil_id,
      idx.tcgplayer_id,
      idx.tcgplayer_etched_id,
      idx.cardmarket_id,
      // let pg handle jsonb
      card
    );
  }
  return params;
}

async function downloadToFile(downloadUrl, destPath) {
  ensureDir(path.dirname(destPath));
  const res = await fetch(downloadUrl, {
    headers: { "User-Agent": "legendary-collectibles-scryfall-bulk/1.0 (local-script)" },
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Download failed HTTP ${res.status}: ${t.slice(0, 200)}`);
  }

  const contentEncoding = res.headers.get("content-encoding") || "";
  const contentType = res.headers.get("content-type") || "";
  const isGzip =
    /gzip/i.test(contentEncoding) ||
    /\.gz$/i.test(destPath) ||
    /application\/gzip/i.test(contentType);

  if (!res.body) throw new Error("No response body stream");

  const tmpPath = destPath + ".tmp";
  const writeStream = fs.createWriteStream(tmpPath);

  try {
    if (isGzip) await pipeline(res.body, zlib.createGunzip(), writeStream);
    else await pipeline(res.body, writeStream);
    fs.renameSync(tmpPath, destPath);
  } finally {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {}
  }

  return { isGzip, contentEncoding, contentType };
}

async function loadStreamJson() {
  let parserFn = null;
  let streamArrayFn = null;

  // parser
  try {
    const m = await import("stream-json");
    parserFn = m?.parser ?? m?.default?.parser ?? null;
  } catch {}
  if (typeof parserFn !== "function") {
    try {
      const m = await import("stream-json/Parser.js");
      parserFn = m?.parser ?? m?.default?.parser ?? null;
    } catch {}
  }
  if (typeof parserFn !== "function") {
    throw new Error(`stream-json parser not found. Install: pnpm add stream-json`);
  }

  // streamArray
  try {
    const m = await import("stream-json/streamers/StreamArray.js");
    streamArrayFn = m?.streamArray ?? m?.default?.streamArray ?? null;
  } catch {}
  if (typeof streamArrayFn !== "function") {
    try {
      const m = await import("stream-json/streamers/StreamArray");
      streamArrayFn = m?.streamArray ?? m?.default?.streamArray ?? null;
    } catch {}
  }
  if (typeof streamArrayFn !== "function") {
    throw new Error(`stream-json streamArray not found. Install: pnpm add stream-json`);
  }

  return { parser: parserFn, streamArray: streamArrayFn };
}

async function main() {
  const args = parseArgs(process.argv);

  const type = String(args.type || "default_cards").trim();
  if (!["default_cards", "oracle_cards", "unique_artwork", "all_cards"].includes(type)) {
    throw new Error(`Unsupported --type "${type}"`);
  }

  const dbUrl = getDbUrl(args);
  if (!dbUrl) throw new Error("DATABASE_URL not set. Pass --db-url or export DATABASE_URL.");

  const outDir = path.resolve(process.cwd(), String(args["out-dir"] || "./out/scryfall/bulk"));
  ensureDir(outDir);

  const batchSize = Math.max(1, Number(args.batch || 250));
  const force = Boolean(args.force);
  const downloadOnly = Boolean(args["download-only"]);
  const noDownload = Boolean(args["no-download"]);
  const delayMs = Number.isFinite(Number(args.delay)) ? Number(args.delay) : 0;
  const fast = Boolean(args.fast);

  const metaPath = path.join(outDir, `scryfall.bulk.${type}.meta.json`);
  const fileArg = args.file ? path.resolve(process.cwd(), String(args.file)) : null;

  let bulkItem = null;
  let filePath = fileArg;

  if (!filePath) {
    bulkItem = await getBulkItem(type);
    const updatedAt = String(bulkItem.updated_at || "").replace(/[:.]/g, "-");
    filePath = path.join(outDir, `scryfall.${type}.${updatedAt}.json`);
  }

  // Skip if unchanged (unless --force)
  if (!force && fs.existsSync(metaPath) && !fileArg) {
    const prev = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    const prevUpdatedAt = prev?.bulk?.updated_at || null;
    if (bulkItem && prevUpdatedAt && String(prevUpdatedAt) === String(bulkItem.updated_at)) {
      console.log(`[bulk] ${type} unchanged (${bulkItem.updated_at}). Skipping.`);
      return;
    }
  }

  // Download
  if (!noDownload && !fileArg) {
    const downloadUrl = bulkItem.download_uri;
    console.log(`[bulk] downloading ${type} from ${downloadUrl}`);
    console.log(`[bulk] -> ${filePath}`);
    const info = await downloadToFile(downloadUrl, filePath);
    console.log(`[bulk] download complete (gzip=${info.isGzip})`);
  } else {
    if (!fs.existsSync(filePath)) throw new Error(`--no-download set but file does not exist: ${filePath}`);
    console.log(`[bulk] using existing file: ${filePath}`);
  }

  // Meta
  if (!fileArg) {
    writeJson(metaPath, { saved_at: new Date().toISOString(), file: filePath, bulk: bulkItem });
  }
  if (downloadOnly) {
    console.log("[bulk] --download-only set; done.");
    return;
  }

  console.log(`[bulk] streaming parse + batch upsert into public.scryfall_cards_raw ...`);
  console.log(`[bulk] batch=${batchSize} fast=${fast ? "on" : "off"}`);

  const { parser, streamArray } = await loadStreamJson();
  const client = await getDbClient(dbUrl);

  let processed = 0;
  let batched = [];
  const startedAt = new Date().toISOString();

  const flush = async () => {
    if (!batched.length) return;

    const chunk = batched;
    batched = [];

    const sqlText = buildUpsertSql(chunk.length);
    const params = batchParams(chunk);

    await client.query("BEGIN");
    try {
      if (fast) await client.query("SET LOCAL synchronous_commit TO OFF");
      await client.query(sqlText, params);
      await client.query("COMMIT");
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      throw e;
    }

    processed += chunk.length;
    console.log(`[bulk] upserted ${processed.toLocaleString()} cards...`);

    if (delayMs > 0) await sleep(delayMs);
  };

  // Ensure flushes serialize (never concurrent)
  let flushing = Promise.resolve();

  try {
    const src = fs.createReadStream(filePath, { encoding: "utf8" });
    const jsonParser = parser();
    const arrayStreamer = streamArray();

    await new Promise((resolve, reject) => {
      const fail = (e) => reject(e instanceof Error ? e : new Error(String(e)));

      arrayStreamer.on("data", ({ value }) => {
        try {
          if (!value || value.object !== "card" || !value.id) return;

          batched.push(value);

          if (batched.length >= batchSize) {
            arrayStreamer.pause();

            flushing = flushing
              .then(flush)
              .then(() => arrayStreamer.resume())
              .catch(fail);
          }
        } catch (e) {
          fail(e);
        }
      });

      arrayStreamer.on("end", async () => {
        try {
          await flushing;
          await flush();
          resolve();
        } catch (e) {
          fail(e);
        }
      });

      arrayStreamer.on("error", fail);
      jsonParser.on("error", fail);
      src.on("error", fail);

      src.pipe(jsonParser).pipe(arrayStreamer);
    });
  } finally {
    await client.end();
  }

  const finishedAt = new Date().toISOString();

  writeJson(metaPath, {
    saved_at: new Date().toISOString(),
    file: filePath,
    bulk: bulkItem,
    run: {
      started_at: startedAt,
      finished_at: finishedAt,
      cards_upserted: processed,
      batch: batchSize,
      fast,
    },
  });

  console.log(`✅ Done. Upserted ${processed.toLocaleString()} cards.`);
}

main().catch((err) => {
  console.error(`\n❌ Error: ${err?.message || err}`);
  process.exit(1);
});
