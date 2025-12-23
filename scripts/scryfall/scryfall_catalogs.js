#!/usr/bin/env node
/**
 * Scryfall Catalogs (Script #7)
 * Location: scripts/scryfall/scryfall_catalogs.js
 *
 * Implements many GET /catalog/* endpoints (Catalog objects).
 *
 * Default DB behavior:
 *  - Upsert catalog payloads into scryfall_catalogs (1 row per catalog endpoint)
 *
 * Optional:
 *  - --explode to also upsert every string into scryfall_catalog_values (one row per value)
 *
 * Env:
 *  - DATABASE_URL=postgres://...
 *
 * Examples:
 *  node scripts/scryfall/scryfall_catalogs.js sync
 *  node scripts/scryfall/scryfall_catalogs.js sync --out-dir ./out/catalogs --meta ./out/catalogs.meta.json
 *  node scripts/scryfall/scryfall_catalogs.js sync --explode
 *  node scripts/scryfall/scryfall_catalogs.js sync --no-db
 */

const fs = require("fs");
const path = require("path");

let pg;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function usage() {
  console.log(`
Scryfall Catalogs (Script #7)

Command:
  sync
    Fetches and stores a suite of /catalog/* endpoints.

Options:
  --out-dir <dir>    Writes each catalog JSON to this folder (optional)
  --meta <path>      Writes run meta JSON (optional)
  --explode          Also upsert each string value into scryfall_catalog_values
  --no-db            Disable DB upserts

Example:
  node scripts/scryfall/scryfall_catalogs.js sync --out-dir ./out/catalogs --explode
`.trim());
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function ensureDirForFile(filePath) {
  ensureDir(path.dirname(filePath));
}

function writeJson(filePath, obj) {
  ensureDirForFile(filePath);
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf8");
}

async function fetchJson(url) {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "scryfall-catalogs-script/1.0 (contact: local-script)",
    },
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Failed to parse JSON from ${url}. HTTP ${res.status}. Body: ${text.slice(0, 400)}`);
  }

  if (!res.ok) {
    const details = json && json.details ? json.details : text.slice(0, 400);
    throw new Error(`HTTP ${res.status} from ${url}: ${details}`);
  }

  return json;
}

function isCatalogObject(o) {
  return (
    o &&
    o.object === "catalog" &&
    typeof o.uri === "string" &&
    typeof o.total_values === "number" &&
    Array.isArray(o.data) &&
    o.data.every((x) => typeof x === "string")
  );
}

async function getDbClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error(`DATABASE_URL is not set (needed for upsert). Use --no-db to run without DB.`);
  }
  if (!pg) pg = require("pg");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  return client;
}

async function upsertCatalog(client, { key, endpoint, catalog }) {
  // One row per catalog (keyed by key)
  const sql = `
    INSERT INTO scryfall_catalogs (
      key, endpoint, uri, total_values, data, payload, fetched_at, updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6, NOW(), NOW())
    ON CONFLICT (key) DO UPDATE SET
      endpoint = EXCLUDED.endpoint,
      uri = EXCLUDED.uri,
      total_values = EXCLUDED.total_values,
      data = EXCLUDED.data,
      payload = EXCLUDED.payload,
      updated_at = NOW()
  `;
  await client.query(sql, [
    key,
    endpoint,
    catalog.uri,
    catalog.total_values,
    catalog.data,   // store as text[] or jsonb later; for now driver will send array
    catalog,        // raw jsonb
  ]);
}

async function upsertCatalogValues(client, { key, values }) {
  // Optional exploded table: one row per value
  // Natural PK: (catalog_key, value)
  const sql = `
    INSERT INTO scryfall_catalog_values (
      catalog_key, value, fetched_at, updated_at
    )
    VALUES ($1,$2, NOW(), NOW())
    ON CONFLICT (catalog_key, value) DO UPDATE SET
      updated_at = NOW()
  `;

  let n = 0;
  for (const v of values) {
    await client.query(sql, [key, v]);
    n++;
  }
  return n;
}

// A curated list from your docs.
// If you later add more /catalog/* endpoints, just append here.
const CATALOGS = [
  { key: "card_names", endpoint: "/catalog/card-names" },
  { key: "artist_names", endpoint: "/catalog/artist-names" },
  { key: "word_bank", endpoint: "/catalog/word-bank" },

  { key: "supertypes", endpoint: "/catalog/supertypes" },
  { key: "card_types", endpoint: "/catalog/card-types" },
  { key: "artifact_types", endpoint: "/catalog/artifact-types" },
  { key: "battle_types", endpoint: "/catalog/battle-types" },
  { key: "creature_types", endpoint: "/catalog/creature-types" },
  { key: "enchantment_types", endpoint: "/catalog/enchantment-types" },
  { key: "land_types", endpoint: "/catalog/land-types" },
  { key: "planeswalker_types", endpoint: "/catalog/planeswalker-types" },
  { key: "spell_types", endpoint: "/catalog/spell-types" },

  { key: "powers", endpoint: "/catalog/powers" },
  { key: "toughnesses", endpoint: "/catalog/toughnesses" },
  { key: "loyalties", endpoint: "/catalog/loyalties" },

  { key: "keyword_abilities", endpoint: "/catalog/keyword-abilities" },
  { key: "keyword_actions", endpoint: "/catalog/keyword-actions" },
  { key: "ability_words", endpoint: "/catalog/ability-words" },
  { key: "flavor_words", endpoint: "/catalog/flavor-words" },
  { key: "watermarks", endpoint: "/catalog/watermarks" },
];

async function cmdSync(args) {
  const outDir = args["out-dir"] || null;
  const metaPath = args.meta || null;
  const explode = !!args.explode;
  const noDb = !!args["no-db"];

  const startedAt = new Date().toISOString();

  if (outDir) ensureDir(outDir);

  let client = null;
  if (!noDb) client = await getDbClient();

  const results = [];
  let explodedCount = 0;

  try {
    for (const c of CATALOGS) {
      const url = `https://api.scryfall.com${c.endpoint}`;
      const json = await fetchJson(url);

      if (!isCatalogObject(json)) {
        throw new Error(`Expected Catalog object for ${c.endpoint}, got object:${json && json.object}`);
      }

      // optional file output
      if (outDir) {
        const filePath = path.join(outDir, `${c.key}.catalog.json`);
        writeJson(filePath, { fetched_at: new Date().toISOString(), requested_url: url, catalog: json });
      }

      // DB upserts
      if (!noDb && client) {
        await upsertCatalog(client, { key: c.key, endpoint: c.endpoint, catalog: json });
        if (explode) {
          explodedCount += await upsertCatalogValues(client, { key: c.key, values: json.data });
        }
      }

      results.push({
        key: c.key,
        endpoint: c.endpoint,
        total_values: json.total_values,
        uri: json.uri,
      });

      console.log(`✅ ${c.endpoint} (${c.key}) -> ${json.total_values} values`);
    }
  } finally {
    if (client) await client.end();
  }

  const finishedAt = new Date().toISOString();

  if (metaPath) {
    writeJson(metaPath, {
      object: "catalogs_sync_meta",
      started_at: startedAt,
      finished_at: finishedAt,
      catalogs_count: results.length,
      exploded: explode,
      exploded_rows_upserted: explode ? explodedCount : null,
      catalogs: results,
      out_dir: outDir,
    });
  }

  console.log(`\n🏁 Done. Catalogs: ${results.length}` + (explode ? ` | exploded rows: ${explodedCount}` : ""));
}

(async function main() {
  const args = parseArgs(process.argv);
  const cmd = args._[0];

  if (!cmd) {
    usage();
    process.exit(1);
  }

  try {
    if (cmd === "sync") {
      await cmdSync(args);
      return;
    }
    usage();
    process.exit(1);
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    process.exit(1);
  }
})();
