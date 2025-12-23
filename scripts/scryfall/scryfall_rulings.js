#!/usr/bin/env node
/**
 * Scryfall Rulings (Script #4)
 * Location: scripts/scryfall/scryfall_rulings.js
 *
 * Implements:
 *  - GET /cards/multiverse/:id/rulings
 *  - GET /cards/mtgo/:id/rulings
 *  - GET /cards/arena/:id/rulings
 *  - GET /cards/:code/:number/rulings
 *  - GET /cards/:id/rulings
 *
 * Output:
 *  - Optional JSONL of ruling objects (one per line)
 *  - Optional meta JSON (counts, request url, warnings)
 *
 * DB:
 *  - Upserts into scryfall_rulings using a hash key because rulings have no ID.
 *
 * Env:
 *  - DATABASE_URL=postgres://...
 *
 * Examples:
 *  node scripts/scryfall/scryfall_rulings.js by-scryfall-id --id <uuid> --out ./out/rulings.jsonl --meta ./out/rulings.meta.json
 *  node scripts/scryfall/scryfall_rulings.js by-set-number --code mh2 --number 1
 *  node scripts/scryfall/scryfall_rulings.js by-multiverse --id 12345
 *  node scripts/scryfall/scryfall_rulings.js by-mtgo --id 99999
 *  node scripts/scryfall/scryfall_rulings.js by-arena --id 77777
 *  node scripts/scryfall/scryfall_rulings.js by-scryfall-id --id <uuid> --no-db
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

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
Scryfall Rulings (Script #4)

Commands:

  by-multiverse --id <int>
    GET /cards/multiverse/:id/rulings

  by-mtgo --id <int>
    GET /cards/mtgo/:id/rulings

  by-arena --id <int>
    GET /cards/arena/:id/rulings

  by-set-number --code <setCode> --number <collectorNumber>
    GET /cards/:code/:number/rulings

  by-scryfall-id --id <uuid>
    GET /cards/:id/rulings

Common options:
  --out  <path.jsonl>   Write ruling objects as JSONL (optional)
  --meta <path.json>    Write run metadata (optional)
  --no-db               Disable DB upserts

Examples:
  node scripts/scryfall/scryfall_rulings.js by-scryfall-id --id 123e4567-e89b-12d3-a456-426614174000
`.trim());
}

function ensureDirForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeJson(filePath, obj) {
  ensureDirForFile(filePath);
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf8");
}

function isUuidLike(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(s || "")
  );
}

async function fetchJson(url) {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "scryfall-rulings-script/1.0 (contact: local-script)",
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

function isRulingObject(o) {
  return (
    o &&
    o.object === "ruling" &&
    o.oracle_id &&
    typeof o.source === "string" &&
    typeof o.published_at === "string" &&
    typeof o.comment === "string"
  );
}

function isListOfRulings(o) {
  return o && o.object === "list" && Array.isArray(o.data) && (o.data.length === 0 || o.data.every(isRulingObject));
}

function rulingHash(r) {
  // Stable dedupe key: oracle_id + source + published_at + comment
  return crypto
    .createHash("sha256")
    .update(String(r.oracle_id))
    .update("|")
    .update(String(r.source))
    .update("|")
    .update(String(r.published_at))
    .update("|")
    .update(String(r.comment))
    .digest("hex");
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

async function upsertRulings(client, rulings) {
  const sql = `
    INSERT INTO scryfall_rulings (
      oracle_id, source, published_at, comment, comment_sha256, fetched_at, updated_at
    )
    VALUES ($1,$2,$3,$4,$5, NOW(), NOW())
    ON CONFLICT (oracle_id, source, published_at, comment_sha256) DO UPDATE SET
      comment = EXCLUDED.comment,
      updated_at = NOW()
  `;

  let ok = 0;
  for (const r of rulings) {
    const h = rulingHash(r);
    await client.query(sql, [r.oracle_id, r.source, r.published_at, r.comment, h]);
    ok++;
  }
  return ok;
}

async function runListEndpoint({ url, outPath, metaPath, noDb }) {
  const startedAt = new Date().toISOString();
  const json = await fetchJson(url);

  if (!isListOfRulings(json)) {
    throw new Error(`Expected List of Rulings, got object:${json && json.object}`);
  }

  // Optional file output (JSONL)
  if (outPath) {
    ensureDirForFile(outPath);
    const s = fs.createWriteStream(outPath, { flags: "w" });
    for (const r of json.data) s.write(JSON.stringify(r) + "\n");
    s.end();
  }

  // DB upsert
  let upserted = 0;
  if (!noDb) {
    const client = await getDbClient();
    try {
      upserted = await upsertRulings(client, json.data);
    } finally {
      await client.end();
    }
    console.log(`🗄️  Upserted ${upserted} rulings`);
  } else {
    upserted = json.data.length;
  }

  const finishedAt = new Date().toISOString();

  // Optional meta output
  if (metaPath) {
    writeJson(metaPath, {
      object: "rulings_run_meta",
      requested_url: url,
      started_at: startedAt,
      finished_at: finishedAt,
      rulings_count: json.data.length,
      upserted_count: upserted,
      has_more: json.has_more ?? null, // should be false for rulings, but keep generic
      next_page: json.next_page ?? null,
      warnings: Array.isArray(json.warnings) ? json.warnings : null,
      out: outPath || null,
    });
  }

  console.log(`✅ Done: ${json.data.length} rulings`);
  if (outPath) console.log(`   JSONL: ${outPath}`);
  if (metaPath) console.log(`   META: ${metaPath}`);
}

async function main() {
  const args = parseArgs(process.argv);
  const cmd = args._[0];

  if (!cmd) {
    usage();
    process.exit(1);
  }

  const out = args.out || null;
  const meta = args.meta || null;
  const noDb = !!args["no-db"];

  try {
    if (cmd === "by-multiverse") {
      const id = args.id;
      if (!id) throw new Error(`by-multiverse requires --id <int>`);
      const url = `https://api.scryfall.com/cards/multiverse/${encodeURIComponent(id)}/rulings`;
      await runListEndpoint({ url, outPath: out, metaPath: meta, noDb });
      return;
    }

    if (cmd === "by-mtgo") {
      const id = args.id;
      if (!id) throw new Error(`by-mtgo requires --id <int>`);
      const url = `https://api.scryfall.com/cards/mtgo/${encodeURIComponent(id)}/rulings`;
      await runListEndpoint({ url, outPath: out, metaPath: meta, noDb });
      return;
    }

    if (cmd === "by-arena") {
      const id = args.id;
      if (!id) throw new Error(`by-arena requires --id <int>`);
      const url = `https://api.scryfall.com/cards/arena/${encodeURIComponent(id)}/rulings`;
      await runListEndpoint({ url, outPath: out, metaPath: meta, noDb });
      return;
    }

    if (cmd === "by-set-number") {
      const code = args.code;
      const number = args.number;
      if (!code || !number) throw new Error(`by-set-number requires --code and --number`);
      const url = `https://api.scryfall.com/cards/${encodeURIComponent(code)}/${encodeURIComponent(number)}/rulings`;
      await runListEndpoint({ url, outPath: out, metaPath: meta, noDb });
      return;
    }

    if (cmd === "by-scryfall-id") {
      const id = args.id;
      if (!id) throw new Error(`by-scryfall-id requires --id <uuid>`);
      if (!isUuidLike(id)) throw new Error(`--id must be a UUID`);
      const url = `https://api.scryfall.com/cards/${encodeURIComponent(id)}/rulings`;
      await runListEndpoint({ url, outPath: out, metaPath: meta, noDb });
      return;
    }

    usage();
    process.exit(1);
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    process.exit(1);
  }
}

main();
