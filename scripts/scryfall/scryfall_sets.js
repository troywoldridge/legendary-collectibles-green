#!/usr/bin/env node
/**
 * Scryfall Sets (Script #2)
 *
 * Location: scripts/scryfall/scryfall_sets.js
 *
 * Commands:
 *   list
 *     node scripts/scryfall/scryfall_sets.js list --out ./out/sets.jsonl --meta ./out/sets.meta.json
 *
 *   get-code <code>
 *     node scripts/scryfall/scryfall_sets.js get-code aer --out ./out/aer.set.json
 *
 *   get-tcgplayer <id>
 *     node scripts/scryfall/scryfall_sets.js get-tcgplayer 1909 --out ./out/tcgplayer_1909.set.json
 *
 *   get-id <uuid>
 *     node scripts/scryfall/scryfall_sets.js get-id 2ec77b94-6d47-4891-a480-5d0b4e5c9372 --out ./out/uma.set.json
 *
 *   sync-db
 *     node scripts/scryfall/scryfall_sets.js sync-db --db-url "$DATABASE_URL"
 *
 * Notes:
 * - /sets is not paginated today (Scryfall returns all), but we keep the loop just in case.
 * - sync-db upserts into public.scryfall_sets matching your current schema.
 */

const fs = require("fs");
const path = require("path");

function usage() {
  console.log(`
Scryfall Sets (Script #2)

Commands:
  list
    Fetch all sets (GET https://api.scryfall.com/sets)
    Options:
      --out  <path>   JSONL output (default: ./out/scryfall.sets.jsonl)
      --meta <path>   Meta JSON output (default: ./out/scryfall.sets.meta.json)
      --delay <ms>    Delay between pages if paginated (default: 120)

  get-code <code>
    Fetch set by code (or mtgo_code) (GET https://api.scryfall.com/sets/:code)
    Options:
      --out  <path>   JSON output (default: ./out/<code>.set.json)

  get-tcgplayer <id>
    Fetch set by tcgplayer groupId (GET https://api.scryfall.com/sets/tcgplayer/:id)
    Options:
      --out  <path>   JSON output (default: ./out/tcgplayer_<id>.set.json)

  get-id <uuid>
    Fetch set by scryfall UUID (GET https://api.scryfall.com/sets/:id)
    Options:
      --out  <path>   JSON output (default: ./out/<uuid>.set.json)

  sync-db
    Upsert all sets into Postgres (public.scryfall_sets)
    Required:
      --db-url <url>  Postgres connection string (DATABASE_URL)

    Optional:
      --delay <ms>    Delay between requests (default: 0)
`.trim());
}

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

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function fetchJson(url) {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "legendary-scryfall-sets/1.0 (local-script)",
    },
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(
      `Failed to parse JSON from ${url}. HTTP ${res.status}. Body: ${text.slice(0, 400)}`
    );
  }

  if (!res.ok) {
    const details = json && json.details ? json.details : text.slice(0, 400);
    throw new Error(`HTTP ${res.status} from ${url}: ${details}`);
  }

  return json;
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

function validateSetObject(setObj) {
  if (!setObj || setObj.object !== "set") {
    throw new Error(
      `Expected object:"set" but got: ${JSON.stringify(
        { object: setObj && setObj.object },
        null,
        2
      )}`
    );
  }
}

/** Normalize Scryfall set to match your DB schema exactly. */
function normalizeSetForDb(s) {
  // Required NOT NULL in your table:
  // id(uuid), code(text), name(text), set_type(text), card_count(int),
  // digital(bool), foil_only(bool), nonfoil_only(bool),
  // scryfall_uri(text), uri(text), search_uri(text), payload(jsonb)
  //
  // Many of these are always present from Scryfall. We still guard & coerce.
  const id = s.id || null;
  const code = s.code || null;
  const name = s.name || null;
  const set_type = s.set_type || null;

  // card_count is required in your schema
  const card_count =
    typeof s.card_count === "number" && Number.isFinite(s.card_count)
      ? s.card_count
      : 0;

  // required booleans with defaults in table, but we always send explicit values
  const digital = !!s.digital;
  const foil_only = !!s.foil_only;
  const nonfoil_only = !!s.nonfoil_only;

  const scryfall_uri = s.scryfall_uri || null;
  const uri = s.uri || null;
  const search_uri = s.search_uri || null;

  return {
    id,
    code,
    mtgo_code: s.mtgo_code || null,
    arena_code: s.arena_code || null,
    tcgplayer_id:
      typeof s.tcgplayer_id === "number" && Number.isFinite(s.tcgplayer_id)
        ? s.tcgplayer_id
        : null,
    name,
    set_type,
    released_at: s.released_at || null, // YYYY-MM-DD
    block_code: s.block_code || null,
    block: s.block || null,
    parent_set_code: s.parent_set_code || null,
    card_count,
    printed_size:
      typeof s.printed_size === "number" && Number.isFinite(s.printed_size)
        ? s.printed_size
        : null,
    digital,
    foil_only,
    nonfoil_only,
    scryfall_uri,
    uri,
    icon_svg_uri: s.icon_svg_uri || null,
    search_uri,
    payload: s,
  };
}

async function listAllSetsToJsonl({ outPath, metaPath, delayMs }) {
  const url = "https://api.scryfall.com/sets";
  ensureDirForFile(outPath);
  ensureDirForFile(metaPath);

  const outStream = fs.createWriteStream(outPath, { flags: "w" });

  let pageUrl = url;
  let pages = 0;
  let setsCount = 0;
  const warnings = [];

  const startedAt = new Date().toISOString();

  while (pageUrl) {
    pages++;

    const page = await fetchJson(pageUrl);

    if (page.object !== "list" || !Array.isArray(page.data)) {
      outStream.end();
      throw new Error(
        `Expected a List object from ${pageUrl}, got: ${JSON.stringify(
          { object: page.object, has_data_array: Array.isArray(page.data) },
          null,
          2
        )}`
      );
    }

    if (Array.isArray(page.warnings)) warnings.push(...page.warnings);

    for (const setObj of page.data) {
      if (setObj && setObj.object !== "set") {
        outStream.end();
        throw new Error(
          `List contained a non-set item: ${JSON.stringify(
            { object: setObj && setObj.object },
            null,
            2
          )}`
        );
      }
      outStream.write(JSON.stringify(setObj) + "\n");
      setsCount++;
    }

    const hasMore = !!page.has_more;
    const nextPage = page.next_page || null;

    console.log(`[Scryfall] /sets page ${pages}: +${page.data.length} (total ${setsCount})`);

    if (hasMore) {
      if (!nextPage) {
        outStream.end();
        throw new Error(`has_more=true but next_page was null (page ${pages})`);
      }
      pageUrl = nextPage;
      if (delayMs > 0) await sleep(delayMs);
    } else {
      pageUrl = null;
    }
  }

  outStream.end();

  const finishedAt = new Date().toISOString();

  const meta = {
    object: "sets_list_run_meta",
    requested_url: url,
    started_at: startedAt,
    finished_at: finishedAt,
    pages_fetched: pages,
    sets_streamed: setsCount,
    warnings: warnings.length ? warnings : null,
    outputs: { jsonl: outPath },
  };

  writeJson(metaPath, meta);

  console.log(`\n✅ Done`);
  console.log(`   JSONL: ${outPath}`);
  console.log(`   META: ${metaPath}`);
  if (meta.warnings) {
    console.log(`\n⚠️ Warnings:`);
    for (const w of meta.warnings) console.log(` - ${w}`);
  }
}

async function getSetByCode(code, outPath) {
  const url = `https://api.scryfall.com/sets/${encodeURIComponent(code)}`;
  const obj = await fetchJson(url);
  validateSetObject(obj);

  writeJson(outPath, {
    fetched_at: new Date().toISOString(),
    requested_url: url,
    set: obj,
  });

  console.log(`✅ Wrote ${outPath}`);
}

async function getSetByTcgplayerId(id, outPath) {
  const url = `https://api.scryfall.com/sets/tcgplayer/${encodeURIComponent(id)}`;
  const obj = await fetchJson(url);
  validateSetObject(obj);

  writeJson(outPath, {
    fetched_at: new Date().toISOString(),
    requested_url: url,
    set: obj,
  });

  console.log(`✅ Wrote ${outPath}`);
}

async function getSetById(uuid, outPath) {
  if (!isUuidLike(uuid)) throw new Error(`get-id expects a UUID, got: ${uuid}`);
  const url = `https://api.scryfall.com/sets/${encodeURIComponent(uuid)}`;
  const obj = await fetchJson(url);
  validateSetObject(obj);

  writeJson(outPath, {
    fetched_at: new Date().toISOString(),
    requested_url: url,
    set: obj,
  });

  console.log(`✅ Wrote ${outPath}`);
}

/* ---------------- sync-db ---------------- */

async function syncDb({ dbUrl, delayMs }) {
  if (!dbUrl) throw new Error(`sync-db requires --db-url`);

  let Client;
  try {
    ({ Client } = require("pg"));
  } catch {
    throw new Error(`Missing dependency "pg". Install with: pnpm add -D pg (or npm i pg)`);
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    const url = "https://api.scryfall.com/sets";
    const page = await fetchJson(url);

    if (page.object !== "list" || !Array.isArray(page.data)) {
      throw new Error(`Unexpected response from /sets: ${JSON.stringify({ object: page.object }, null, 2)}`);
    }

    const sets = page.data;
    console.log(`[sync-db] fetched ${sets.length} sets from Scryfall`);

    let upserted = 0;
    let skipped = 0;

    // Use a transaction for speed + safety
    await client.query("BEGIN");

    const upsertSql = `
      INSERT INTO public.scryfall_sets (
        id, code, mtgo_code, arena_code, tcgplayer_id, name, set_type, released_at,
        block_code, block, parent_set_code, card_count, printed_size, digital, foil_only, nonfoil_only,
        scryfall_uri, uri, icon_svg_uri, search_uri, payload, fetched_at, updated_at, created_at
      ) VALUES (
        $1::uuid, $2, $3, $4, $5::int, $6, $7, $8::date,
        $9, $10, $11, $12::int, $13::int, $14::boolean, $15::boolean, $16::boolean,
        $17, $18, $19, $20, $21::jsonb, now(), now(), now()
      )
      ON CONFLICT (id) DO UPDATE SET
        code            = EXCLUDED.code,
        mtgo_code        = EXCLUDED.mtgo_code,
        arena_code       = EXCLUDED.arena_code,
        tcgplayer_id     = EXCLUDED.tcgplayer_id,
        name             = EXCLUDED.name,
        set_type         = EXCLUDED.set_type,
        released_at      = EXCLUDED.released_at,
        block_code       = EXCLUDED.block_code,
        block            = EXCLUDED.block,
        parent_set_code  = EXCLUDED.parent_set_code,
        card_count       = EXCLUDED.card_count,
        printed_size     = EXCLUDED.printed_size,
        digital          = EXCLUDED.digital,
        foil_only        = EXCLUDED.foil_only,
        nonfoil_only     = EXCLUDED.nonfoil_only,
        scryfall_uri     = EXCLUDED.scryfall_uri,
        uri              = EXCLUDED.uri,
        icon_svg_uri     = EXCLUDED.icon_svg_uri,
        search_uri       = EXCLUDED.search_uri,
        payload          = EXCLUDED.payload,
        fetched_at       = now(),
        updated_at       = now()
    `;

    for (const s of sets) {
      const row = normalizeSetForDb(s);

      // Hard guard: your table requires these.
      if (!row.id || !row.code || !row.name || !row.set_type || !row.scryfall_uri || !row.uri || !row.search_uri) {
        skipped++;
        continue;
      }

      await client.query(upsertSql, [
        row.id,
        row.code,
        row.mtgo_code,
        row.arena_code,
        row.tcgplayer_id,
        row.name,
        row.set_type,
        row.released_at,
        row.block_code,
        row.block,
        row.parent_set_code,
        row.card_count,
        row.printed_size,
        row.digital,
        row.foil_only,
        row.nonfoil_only,
        row.scryfall_uri,
        row.uri,
        row.icon_svg_uri,
        row.search_uri,
        JSON.stringify(row.payload),
      ]);

      upserted++;

      if (delayMs > 0) await sleep(delayMs);
      if (upserted % 200 === 0) console.log(`[sync-db] upserted ${upserted}/${sets.length}...`);
    }

    await client.query("COMMIT");

    console.log(`✅ sync-db complete`);
    console.log(`   upserted: ${upserted}`);
    console.log(`   skipped:  ${skipped}`);
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    throw err;
  } finally {
    await client.end();
  }
}

/* ---------------- main ---------------- */

(async function main() {
  const args = parseArgs(process.argv);
  const cmd = args._[0];

  if (!cmd) {
    usage();
    process.exit(1);
  }

  try {
    if (cmd === "list") {
      const outPath = args.out || "./out/scryfall.sets.jsonl";
      const metaPath = args.meta || "./out/scryfall.sets.meta.json";
      const delayMs = Number.isFinite(Number(args.delay)) ? Number(args.delay) : 120;
      await listAllSetsToJsonl({ outPath, metaPath, delayMs });
      return;
    }

    if (cmd === "get-code") {
      const code = args._[1];
      if (!code) throw new Error(`Missing <code> for get-code`);
      const outPath = args.out || `./out/${code}.set.json`;
      await getSetByCode(code, outPath);
      return;
    }

    if (cmd === "get-tcgplayer") {
      const id = args._[1];
      if (!id) throw new Error(`Missing <id> for get-tcgplayer`);
      const outPath = args.out || `./out/tcgplayer_${id}.set.json`;
      await getSetByTcgplayerId(id, outPath);
      return;
    }

    if (cmd === "get-id") {
      const uuid = args._[1];
      if (!uuid) throw new Error(`Missing <uuid> for get-id`);
      const outPath = args.out || `./out/${uuid}.set.json`;
      await getSetById(uuid, outPath);
      return;
    }

    if (cmd === "sync-db") {
      const dbUrl = args["db-url"] || args.dbUrl || process.env.DATABASE_URL;
      const delayMs = Number.isFinite(Number(args.delay)) ? Number(args.delay) : 0;
      await syncDb({ dbUrl, delayMs });
      return;
    }

    usage();
    process.exit(1);
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    process.exit(1);
  }
})();
