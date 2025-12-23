#!/usr/bin/env node
/**
 * Scryfall Cards (Script #3)
 * Location: scripts/scryfall/scryfall_cards.js
 *
 * What it does:
 * - Implements all Card endpoints from your docs (sections 2–13).
 * - For JSON Card responses (single or list), UPSERTS into DB table: scryfall_cards_raw
 * - Optionally also writes JSONL/JSON output files.
 *
 * DB requirement (we'll formalize later, but for now this script expects):
 *   scryfall_cards_raw(
 *     id uuid primary key,
 *     oracle_id uuid null,
 *     lang text not null,
 *     name text not null,
 *     set_code text null,
 *     collector_number text null,
 *     released_at date null,
 *     arena_id int null,
 *     mtgo_id int null,
 *     mtgo_foil_id int null,
 *     tcgplayer_id int null,
 *     tcgplayer_etched_id int null,
 *     cardmarket_id int null,
 *     payload jsonb not null,
 *     fetched_at timestamptz not null default now(),
 *     updated_at timestamptz not null default now()
 *   )
 *
 * Env:
 *   DATABASE_URL=postgres://...
 *
 * Examples:
 *   # Search cards (paginated list, upsert each)
 *   node scripts/scryfall/scryfall_cards.js search --q "c:white mv=1" --unique cards --order name --dir auto
 *
 *   # Named (fuzzy)
 *   node scripts/scryfall/scryfall_cards.js named --fuzzy "aust com"
 *
 *   # Autocomplete (prints results; optionally save to file)
 *   node scripts/scryfall/scryfall_cards.js autocomplete --q "smugg"
 *
 *   # Random
 *   node scripts/scryfall/scryfall_cards.js random
 *   node scripts/scryfall/scryfall_cards.js random --q "t:legendary c:blue"
 *
 *   # Collection (POST up to 75 identifiers; provide JSON file)
 *   node scripts/scryfall/scryfall_cards.js collection --identifiers ./out/identifiers.json
 *
 *   # Get by set/number/lang
 *   node scripts/scryfall/scryfall_cards.js get-set-number --code mh2 --number 1 --lang en
 *
 *   # Get by IDs
 *   node scripts/scryfall/scryfall_cards.js get-id --id 2ec77b94-6d47-4891-a480-5d0b4e5c9372  (NOTE: that's a set UUID, example only)
 */

const fs = require("fs");
const path = require("path");

let pg; // lazy require so script still runs for non-DB actions

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
Scryfall Cards (Script #3)

Commands:

  search
    GET /cards/search (paginated list)
    Required:
      --q "<query>"
    Optional:
      --unique cards|art|prints
      --order name|set|released|rarity|color|usd|tix|eur|cmc|power|toughness|edhrec|penny|artist|review
      --dir auto|asc|desc
      --include_extras true|false
      --include_multilingual true|false
      --include_variations true|false
      --page <int> (starting page; default 1)
      --delay <ms> (between pages; default 120)
      --out <path.jsonl> (optional JSONL output)
      --meta <path.json>  (optional run meta output)
      --no-db (disable DB upserts)

  named
    GET /cards/named
    Required:
      --exact "<name>"  OR  --fuzzy "<name>"
    Optional:
      --set "<setCode>"
      --out <path.json>
      --no-db

  autocomplete
    GET /cards/autocomplete
    Required:
      --q "<string>"
    Optional:
      --include_extras true|false
      --out <path.json>

  random
    GET /cards/random
    Optional:
      --q "<query>"
      --out <path.json>
      --no-db

  collection
    POST /cards/collection
    Required:
      --identifiers <path.json>   (JSON file with { "identifiers": [ ... ] } OR just [ ... ])
    Optional:
      --out <path.jsonl> (writes returned cards to JSONL)
      --meta <path.json>
      --no-db

  get-set-number
    GET /cards/:code/:number(/:lang)
    Required:
      --code "<setCode>"
      --number "<collectorNumber>"
    Optional:
      --lang "<lang>"
      --out <path.json>
      --no-db

  get-multiverse
    GET /cards/multiverse/:id
    Required: --id <int>

  get-mtgo
    GET /cards/mtgo/:id
    Required: --id <int>

  get-arena
    GET /cards/arena/:id
    Required: --id <int>

  get-tcgplayer
    GET /cards/tcgplayer/:id
    Required: --id <int>

  get-cardmarket
    GET /cards/cardmarket/:id
    Required: --id <int>

  get-id
    GET /cards/:id
    Required: --id <uuid>

Notes:
- For all "get-*" commands: optional --out and --no-db apply.
- This script only upserts when the response is a Card object or List of Card objects.

`.trim());
}

function ensureDirForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeJson(filePath, obj) {
  ensureDirForFile(filePath);
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf8");
}

function boolArg(v, defaultValue = false) {
  if (v == null) return defaultValue;
  const s = String(v).toLowerCase().trim();
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return defaultValue;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isUuidLike(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(s || "")
  );
}

async function fetchJson(url, { method = "GET", bodyJson } = {}) {
  const headers = {
    Accept: "application/json",
    "User-Agent": "scryfall-cards-script/1.0 (contact: local-script)",
  };
  let body;
  if (bodyJson != null) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(bodyJson);
  }

  const res = await fetch(url, { method, headers, body });
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

function isCardObject(o) {
  return o && o.object === "card" && o.id;
}

function isListOfCards(o) {
  return o && o.object === "list" && Array.isArray(o.data) && (o.data.length === 0 || o.data.every(isCardObject));
}

async function getDbClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error(`DATABASE_URL is not set (needed for upsert). Set --no-db to run without DB.`);
  }
  if (!pg) pg = require("pg");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  return client;
}

function pickIndexColumns(card) {
  // Keep this light: raw-first, but helpful for querying and joining later.
  return {
    id: card.id,
    oracle_id: card.oracle_id || null,
    lang: card.lang || "en",
    name: card.name || "",
    set_code: card.set || null,
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

async function upsertCards(client, cards) {
  // One-by-one upsert keeps logic simple; you can batch later if you want.
  const sql = `
    INSERT INTO scryfall_cards_raw (
      id, oracle_id, lang, name, set_code, collector_number, released_at,
      arena_id, mtgo_id, mtgo_foil_id, tcgplayer_id, tcgplayer_etched_id, cardmarket_id,
      payload, fetched_at, updated_at
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,
      $8,$9,$10,$11,$12,$13,
      $14, NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      oracle_id = EXCLUDED.oracle_id,
      lang = EXCLUDED.lang,
      name = EXCLUDED.name,
      set_code = EXCLUDED.set_code,
      collector_number = EXCLUDED.collector_number,
      released_at = EXCLUDED.released_at,
      arena_id = EXCLUDED.arena_id,
      mtgo_id = EXCLUDED.mtgo_id,
      mtgo_foil_id = EXCLUDED.mtgo_foil_id,
      tcgplayer_id = EXCLUDED.tcgplayer_id,
      tcgplayer_etched_id = EXCLUDED.tcgplayer_etched_id,
      cardmarket_id = EXCLUDED.cardmarket_id,
      payload = EXCLUDED.payload,
      updated_at = NOW()
  `;

  let ok = 0;
  for (const card of cards) {
    const idx = pickIndexColumns(card);
    const params = [
      idx.id,
      idx.oracle_id,
      idx.lang,
      idx.name,
      idx.set_code,
      idx.collector_number,
      idx.released_at,
      idx.arena_id,
      idx.mtgo_id,
      idx.mtgo_foil_id,
      idx.tcgplayer_id,
      idx.tcgplayer_etched_id,
      idx.cardmarket_id,
      card, // pg will JSON-encode to jsonb
    ];
    await client.query(sql, params);
    ok++;
  }
  return ok;
}

async function handleCardOrList({ json, out, meta, noDb }) {
  const nowIso = new Date().toISOString();

  // optional output
  if (out) {
    ensureDirForFile(out);
    if (isCardObject(json)) {
      writeJson(out, { fetched_at: nowIso, card: json });
    } else if (isListOfCards(json)) {
      // JSONL for lists
      const s = fs.createWriteStream(out, { flags: "w" });
      for (const c of json.data) s.write(JSON.stringify(c) + "\n");
      s.end();
    } else {
      writeJson(out, { fetched_at: nowIso, payload: json });
    }
  }

  if (meta) {
    const metaObj = {
      fetched_at: nowIso,
      object: json && json.object ? json.object : null,
      has_more: json && typeof json.has_more === "boolean" ? json.has_more : null,
      next_page: json && json.next_page ? json.next_page : null,
      total_cards: json && typeof json.total_cards === "number" ? json.total_cards : null,
      warnings: Array.isArray(json && json.warnings) ? json.warnings : null,
      out: out || null,
    };
    writeJson(meta, metaObj);
  }

  // DB upsert
  if (!noDb) {
    if (isCardObject(json)) {
      const client = await getDbClient();
      try {
        const n = await upsertCards(client, [json]);
        console.log(`🗄️  Upserted ${n} card`);
      } finally {
        await client.end();
      }
    } else if (isListOfCards(json)) {
      const client = await getDbClient();
      try {
        const n = await upsertCards(client, json.data);
        console.log(`🗄️  Upserted ${n} cards`);
      } finally {
        await client.end();
      }
    } else {
      // not a card payload; do nothing
    }
  }
}

/* ============================
   Commands (Sections 2–13)
   ============================ */

async function cmdSearch(args) {
  const q = args.q;
  if (!q) throw new Error(`search requires --q "<query>"`);

  const unique = args.unique;
  const order = args.order;
  const dir = args.dir;

  const include_extras = boolArg(args.include_extras, false);
  const include_multilingual = boolArg(args.include_multilingual, false);
  const include_variations = boolArg(args.include_variations, false);

  const startPage = Number.isFinite(Number(args.page)) ? Number(args.page) : 1;
  const delayMs = Number.isFinite(Number(args.delay)) ? Number(args.delay) : 120;

  const out = args.out || null;
  const meta = args.meta || null;
  const noDb = !!args["no-db"];

  // If outputting list, use JSONL. If not provided, just DB-upsert.
  let pageUrl =
    `https://api.scryfall.com/cards/search?` +
    new URLSearchParams({
      q,
      ...(unique ? { unique } : {}),
      ...(order ? { order } : {}),
      ...(dir ? { dir } : {}),
      ...(include_extras ? { include_extras: "true" } : {}),
      ...(include_multilingual ? { include_multilingual: "true" } : {}),
      ...(include_variations ? { include_variations: "true" } : {}),
      page: String(startPage),
    }).toString();

  const warnings = [];
  let pages = 0;
  let total = null;
  let streamed = 0;

  let outStream = null;
  if (out) {
    ensureDirForFile(out);
    outStream = fs.createWriteStream(out, { flags: "w" });
  }

  const startedAt = new Date().toISOString();

  // Keep one DB connection for the whole pagination run if using DB.
  let client = null;
  if (!noDb) client = await getDbClient();

  try {
    while (pageUrl) {
      pages++;
      const list = await fetchJson(pageUrl);

      if (!isListOfCards(list)) {
        throw new Error(`Expected List of Cards from search, got object:${list && list.object}`);
      }

      if (typeof list.total_cards === "number") total = list.total_cards;
      if (Array.isArray(list.warnings)) warnings.push(...list.warnings);

      if (outStream) {
        for (const c of list.data) outStream.write(JSON.stringify(c) + "\n");
      }

      if (!noDb && client) {
        const n = await upsertCards(client, list.data);
        streamed += n;
      } else {
        streamed += list.data.length;
      }

      console.log(
        `[Scryfall] search page ${pages}: +${list.data.length} (processed ${streamed}` +
          (typeof total === "number" ? ` / total_cards ${total}` : "") +
          `)`
      );

      if (list.has_more) {
        if (!list.next_page) throw new Error(`has_more=true but next_page missing`);
        pageUrl = list.next_page;
        if (delayMs > 0) await sleep(delayMs);
      } else {
        pageUrl = null;
      }
    }
  } finally {
    if (outStream) outStream.end();
    if (client) await client.end();
  }

  const finishedAt = new Date().toISOString();
  if (meta) {
    writeJson(meta, {
      object: "cards_search_run_meta",
      q,
      started_at: startedAt,
      finished_at: finishedAt,
      pages_fetched: pages,
      cards_processed: streamed,
      total_cards: total,
      warnings: warnings.length ? warnings : null,
      out: out || null,
    });
  }
}

async function cmdNamed(args) {
  const exact = args.exact || null;
  const fuzzy = args.fuzzy || null;
  if (!exact && !fuzzy) throw new Error(`named requires --exact "<name>" or --fuzzy "<name>"`);

  const set = args.set || null;
  const out = args.out || null;
  const noDb = !!args["no-db"];

  const qs = new URLSearchParams({
    ...(exact ? { exact } : {}),
    ...(fuzzy ? { fuzzy } : {}),
    ...(set ? { set } : {}),
    format: "json",
  });

  const url = `https://api.scryfall.com/cards/named?${qs.toString()}`;
  const json = await fetchJson(url);
  if (!isCardObject(json)) throw new Error(`named returned non-card object:${json && json.object}`);

  await handleCardOrList({ json, out, meta: null, noDb });
}

async function cmdAutocomplete(args) {
  const q = args.q;
  if (!q) throw new Error(`autocomplete requires --q "<string>"`);

  const include_extras = boolArg(args.include_extras, false);
  const out = args.out || null;

  const qs = new URLSearchParams({
    q,
    ...(include_extras ? { include_extras: "true" } : {}),
    format: "json",
  });

  const url = `https://api.scryfall.com/cards/autocomplete?${qs.toString()}`;
  const json = await fetchJson(url);

  // Catalog object: { object:"catalog", data:[names...] }
  if (out) writeJson(out, { fetched_at: new Date().toISOString(), requested_url: url, catalog: json });

  // Print useful output
  const names = Array.isArray(json && json.data) ? json.data : [];
  console.log(names.join("\n"));
}

async function cmdRandom(args) {
  const q = args.q || null;
  const out = args.out || null;
  const noDb = !!args["no-db"];

  const qs = new URLSearchParams({
    ...(q ? { q } : {}),
    format: "json",
  });

  const url = `https://api.scryfall.com/cards/random?${qs.toString()}`;
  const json = await fetchJson(url);
  if (!isCardObject(json)) throw new Error(`random returned non-card object:${json && json.object}`);

  await handleCardOrList({ json, out, meta: null, noDb });
}

async function cmdCollection(args) {
  const idPath = args.identifiers;
  if (!idPath) throw new Error(`collection requires --identifiers <path.json>`);

  const out = args.out || null;
  const meta = args.meta || null;
  const noDb = !!args["no-db"];

  const raw = fs.readFileSync(idPath, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Failed to parse identifiers JSON file: ${idPath}`);
  }

  let identifiers = parsed;
  if (parsed && typeof parsed === "object" && Array.isArray(parsed.identifiers)) {
    identifiers = parsed.identifiers;
  }
  if (!Array.isArray(identifiers)) throw new Error(`identifiers must be an array or {identifiers:[...]}`);

  if (identifiers.length === 0) throw new Error(`identifiers array is empty`);
  if (identifiers.length > 75) {
    throw new Error(`Scryfall /cards/collection max is 75 identifiers per request (got ${identifiers.length})`);
  }

  const url = `https://api.scryfall.com/cards/collection`;
  const json = await fetchJson(url, { method: "POST", bodyJson: { identifiers } });

  if (!isListOfCards(json)) throw new Error(`collection returned non-list-of-cards object:${json && json.object}`);

  // Optional outputs + DB upsert
  await handleCardOrList({ json, out, meta, noDb });
}

async function cmdGetSetNumber(args) {
  const code = args.code;
  const number = args.number;
  if (!code || !number) throw new Error(`get-set-number requires --code and --number`);
  const lang = args.lang || null;

  const out = args.out || null;
  const noDb = !!args["no-db"];

  const url = lang
    ? `https://api.scryfall.com/cards/${encodeURIComponent(code)}/${encodeURIComponent(number)}/${encodeURIComponent(lang)}`
    : `https://api.scryfall.com/cards/${encodeURIComponent(code)}/${encodeURIComponent(number)}`;

  const json = await fetchJson(url);
  if (!isCardObject(json)) throw new Error(`get-set-number returned non-card object:${json && json.object}`);

  await handleCardOrList({ json, out, meta: null, noDb });
}

async function cmdGetByPath(args, pathPart) {
  const out = args.out || null;
  const noDb = !!args["no-db"];
  const url = `https://api.scryfall.com/${pathPart}`;
  const json = await fetchJson(url);
  if (!isCardObject(json)) throw new Error(`returned non-card object:${json && json.object}`);
  await handleCardOrList({ json, out, meta: null, noDb });
}

async function cmdGetMultiverse(args) {
  const id = args.id;
  if (!id) throw new Error(`get-multiverse requires --id <int>`);
  await cmdGetByPath(args, `cards/multiverse/${encodeURIComponent(id)}`);
}
async function cmdGetMtgo(args) {
  const id = args.id;
  if (!id) throw new Error(`get-mtgo requires --id <int>`);
  await cmdGetByPath(args, `cards/mtgo/${encodeURIComponent(id)}`);
}
async function cmdGetArena(args) {
  const id = args.id;
  if (!id) throw new Error(`get-arena requires --id <int>`);
  await cmdGetByPath(args, `cards/arena/${encodeURIComponent(id)}`);
}
async function cmdGetTcgplayer(args) {
  const id = args.id;
  if (!id) throw new Error(`get-tcgplayer requires --id <int>`);
  await cmdGetByPath(args, `cards/tcgplayer/${encodeURIComponent(id)}`);
}
async function cmdGetCardmarket(args) {
  const id = args.id;
  if (!id) throw new Error(`get-cardmarket requires --id <int>`);
  await cmdGetByPath(args, `cards/cardmarket/${encodeURIComponent(id)}`);
}
async function cmdGetId(args) {
  const id = args.id;
  if (!id) throw new Error(`get-id requires --id <uuid>`);
  if (!isUuidLike(id)) throw new Error(`get-id expects a UUID, got: ${id}`);
  await cmdGetByPath(args, `cards/${encodeURIComponent(id)}`);
}

/* ============================
   Main
   ============================ */

(async function main() {
  const args = parseArgs(process.argv);
  const cmd = args._[0];

  if (!cmd) {
    usage();
    process.exit(1);
  }

  try {
    switch (cmd) {
      case "search":
        await cmdSearch(args);
        break;
      case "named":
        await cmdNamed(args);
        break;
      case "autocomplete":
        await cmdAutocomplete(args);
        break;
      case "random":
        await cmdRandom(args);
        break;
      case "collection":
        await cmdCollection(args);
        break;
      case "get-set-number":
        await cmdGetSetNumber(args);
        break;
      case "get-multiverse":
        await cmdGetMultiverse(args);
        break;
      case "get-mtgo":
        await cmdGetMtgo(args);
        break;
      case "get-arena":
        await cmdGetArena(args);
        break;
      case "get-tcgplayer":
        await cmdGetTcgplayer(args);
        break;
      case "get-cardmarket":
        await cmdGetCardmarket(args);
        break;
      case "get-id":
        await cmdGetId(args);
        break;
      default:
        usage();
        process.exit(1);
    }
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    process.exit(1);
  }
})();
