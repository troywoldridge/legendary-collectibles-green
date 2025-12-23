#!/usr/bin/env node
/**
 * Scryfall Symbology (Script #6)
 * Location: scripts/scryfall/scryfall_symbology.js
 *
 * Implements:
 *  - GET /symbology           (List of Card Symbol objects)
 *  - GET /symbology/parse-mana (Mana cost parser utility)
 *
 * DB:
 *  - Upserts symbols into scryfall_card_symbols
 *  - (Optional later) cache parse-mana results
 *
 * Env:
 *  - DATABASE_URL=postgres://...
 *
 * Examples:
 *  node scripts/scryfall/scryfall_symbology.js sync --out ./out/symbology.jsonl --meta ./out/symbology.meta.json
 *  node scripts/scryfall/scryfall_symbology.js parse --cost "2WW"
 *  node scripts/scryfall/scryfall_symbology.js parse --cost "2{g}2" --out ./out/parsed.json
 *  node scripts/scryfall/scryfall_symbology.js sync --no-db
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
Scryfall Symbology (Script #6)

Commands:

  sync
    GET https://api.scryfall.com/symbology
    Options:
      --out  <path.jsonl>   Write Card Symbol objects as JSONL (optional)
      --meta <path.json>    Write metadata JSON (optional)
      --no-db               Disable DB upserts

  parse
    GET https://api.scryfall.com/symbology/parse-mana?cost=...
    Required:
      --cost "<mana cost string>"   e.g. "2WW" or "2{g}2"
    Options:
      --out <path.json>      Write response JSON (optional)

Notes:
- sync is the one you generally run to keep local symbols updated.
- parse is a utility; by default it prints to console.

`.trim());
}

function ensureDirForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
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
      "User-Agent": "scryfall-symbology-script/1.0 (contact: local-script)",
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

function isCardSymbolObject(o) {
  return (
    o &&
    o.object === "card_symbol" &&
    typeof o.symbol === "string" &&
    typeof o.english === "string" &&
    typeof o.transposable === "boolean" &&
    typeof o.represents_mana === "boolean"
  );
}

function isListOfCardSymbols(o) {
  return o && o.object === "list" && Array.isArray(o.data) && (o.data.length === 0 || o.data.every(isCardSymbolObject));
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

function pickSymbolColumns(s) {
  return {
    symbol: s.symbol,
    loose_variant: s.loose_variant ?? null,
    english: s.english,

    transposable: !!s.transposable,
    represents_mana: !!s.represents_mana,

    mana_value: s.mana_value ?? null,
    appears_in_mana_costs: !!s.appears_in_mana_costs,
    funny: !!s.funny,

    colors: Array.isArray(s.colors) ? s.colors : [],
    hybrid: !!s.hybrid,
    phyrexian: !!s.phyrexian,

    gatherer_alternates: s.gatherer_alternates ?? null, // docs say nullable; treat as array or null
    svg_uri: s.svg_uri ?? null,
  };
}

async function upsertSymbols(client, symbols) {
  // We key by `symbol` (plaintext token) since Scryfall provides no separate ID.
  const sql = `
    INSERT INTO scryfall_card_symbols (
      symbol, loose_variant, english,
      transposable, represents_mana,
      mana_value, appears_in_mana_costs, funny,
      colors, hybrid, phyrexian,
      gatherer_alternates, svg_uri,
      payload, fetched_at, updated_at
    )
    VALUES (
      $1,$2,$3,
      $4,$5,
      $6,$7,$8,
      $9,$10,$11,
      $12,$13,
      $14, NOW(), NOW()
    )
    ON CONFLICT (symbol) DO UPDATE SET
      loose_variant = EXCLUDED.loose_variant,
      english = EXCLUDED.english,
      transposable = EXCLUDED.transposable,
      represents_mana = EXCLUDED.represents_mana,
      mana_value = EXCLUDED.mana_value,
      appears_in_mana_costs = EXCLUDED.appears_in_mana_costs,
      funny = EXCLUDED.funny,
      colors = EXCLUDED.colors,
      hybrid = EXCLUDED.hybrid,
      phyrexian = EXCLUDED.phyrexian,
      gatherer_alternates = EXCLUDED.gatherer_alternates,
      svg_uri = EXCLUDED.svg_uri,
      payload = EXCLUDED.payload,
      updated_at = NOW()
  `;

  let ok = 0;
  for (const s of symbols) {
    const c = pickSymbolColumns(s);
    const params = [
      c.symbol,
      c.loose_variant,
      c.english,
      c.transposable,
      c.represents_mana,
      c.mana_value,
      c.appears_in_mana_costs,
      c.funny,
      c.colors,
      c.hybrid,
      c.phyrexian,
      c.gatherer_alternates,
      c.svg_uri,
      s, // raw payload jsonb
    ];
    await client.query(sql, params);
    ok++;
  }
  return ok;
}

async function cmdSync(args) {
  const out = args.out || null;
  const meta = args.meta || null;
  const noDb = !!args["no-db"];

  const url = "https://api.scryfall.com/symbology";
  const startedAt = new Date().toISOString();
  const json = await fetchJson(url);

  if (!isListOfCardSymbols(json)) {
    throw new Error(`Expected List of Card Symbols, got object:${json && json.object}`);
  }

  // optional JSONL
  if (out) {
    ensureDirForFile(out);
    const s = fs.createWriteStream(out, { flags: "w" });
    for (const sym of json.data) s.write(JSON.stringify(sym) + "\n");
    s.end();
  }

  let upserted = 0;
  if (!noDb) {
    const client = await getDbClient();
    try {
      upserted = await upsertSymbols(client, json.data);
    } finally {
      await client.end();
    }
    console.log(`🗄️  Upserted ${upserted} symbols`);
  } else {
    upserted = json.data.length;
  }

  const finishedAt = new Date().toISOString();

  if (meta) {
    writeJson(meta, {
      object: "symbology_sync_meta",
      requested_url: url,
      started_at: startedAt,
      finished_at: finishedAt,
      symbols_count: json.data.length,
      upserted_count: upserted,
      warnings: Array.isArray(json.warnings) ? json.warnings : null,
      out: out || null,
    });
  }

  console.log(`✅ Done: ${json.data.length} symbols`);
}

async function cmdParse(args) {
  const cost = args.cost;
  if (!cost) throw new Error(`parse requires --cost "<mana string>"`);

  const out = args.out || null;

  const qs = new URLSearchParams({ cost, format: "json" });
  const url = `https://api.scryfall.com/symbology/parse-mana?${qs.toString()}`;

  const json = await fetchJson(url);

  // Expected shape:
  // { object:"mana_cost", cost:"{2}{W}{W}", cmc:4, colors:["W"], colorless:false, monocolored:true, multicolored:false }
  if (out) {
    writeJson(out, { fetched_at: new Date().toISOString(), requested_url: url, parsed: json });
    console.log(`✅ Wrote ${out}`);
  } else {
    console.log(JSON.stringify(json, null, 2));
  }
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
    if (cmd === "parse") {
      await cmdParse(args);
      return;
    }

    usage();
    process.exit(1);
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    process.exit(1);
  }
})();
