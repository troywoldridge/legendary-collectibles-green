#!/usr/bin/env node
/**
 * Scryfall Sets (Script #2)
 *
 * Location: scripts/scryfall/scryfall_sets.js
 *
 * Commands:
 *   1) List all sets (GET /sets -> List object)
 *      node scripts/scryfall/scryfall_sets.js list --out ./out/sets.jsonl --meta ./out/sets.meta.json
 *
 *   2) Get set by code (GET /sets/:code)  (code OR mtgo_code)
 *      node scripts/scryfall/scryfall_sets.js get-code aer --out ./out/aer.set.json
 *
 *   3) Get set by tcgplayer id (GET /sets/tcgplayer/:id)
 *      node scripts/scryfall/scryfall_sets.js get-tcgplayer 1909 --out ./out/tcgplayer_1909.set.json
 *
 *   4) Get set by scryfall UUID (GET /sets/:id)
 *      node scripts/scryfall/scryfall_sets.js get-id 2ec77b94-6d47-4891-a480-5d0b4e5c9372 --out ./out/uma.set.json
 *
 * Notes:
 * - Uses JSONL for list endpoints (streaming, scalable).
 * - Records list-level warnings if present.
 * - Validates that returned objects are of type "set" (or "list" for list).
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

Examples:
  node scripts/scryfall/scryfall_sets.js list
  node scripts/scryfall/scryfall_sets.js get-code mmq
  node scripts/scryfall/scryfall_sets.js get-tcgplayer 1909
  node scripts/scryfall/scryfall_sets.js get-id 2ec77b94-6d47-4891-a480-5d0b4e5c9372
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
      "User-Agent": "scryfall-sets-script/1.0 (contact: local-script)",
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
      // Each item here should be a Set object
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
    outputs: {
      jsonl: outPath,
    },
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
  if (!isUuidLike(uuid)) {
    throw new Error(`get-id expects a UUID, got: ${uuid}`);
  }
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

// --- main ---
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

    usage();
    process.exit(1);
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    process.exit(1);
  }
})();
