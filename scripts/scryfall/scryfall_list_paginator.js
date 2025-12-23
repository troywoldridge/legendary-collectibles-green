#!/usr/bin/env node
/**
 * Scryfall List Object Paginator (Script #1)
 *
 * Usage:
 *   node scripts/scryfall_list_paginator.js \
 *     --url "https://api.scryfall.com/cards/search?q=c%3Awhite+mv%3D1" \
 *     --out "./out/white_mv1.cards.jsonl" \
 *     --meta "./out/white_mv1.meta.json" \
 *     --delay 120
 *
 * Notes:
 * - Uses JSONL output for large datasets (one object per line).
 * - Handles Scryfall pagination via `has_more` + `next_page`.
 * - Records list-level `warnings` and `total_cards` (when present).
 */

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
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
      "Accept": "application/json",
      // Scryfall likes having a descriptive UA; keep it honest.
      "User-Agent": "scryfall-list-paginator/1.0 (contact: local-script)",
    },
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(`Failed to parse JSON from ${url}. HTTP ${res.status}. Body: ${text.slice(0, 400)}`);
  }

  if (!res.ok) {
    // Scryfall error objects usually have { object:"error", details, ... }
    const details = json && json.details ? json.details : text.slice(0, 400);
    throw new Error(`HTTP ${res.status} from ${url}: ${details}`);
  }

  return json;
}

/**
 * Fetches and streams ALL items from a Scryfall List endpoint.
 * Returns metadata about the overall list and run.
 */
async function paginateListToJsonl({ url, outPath, metaPath, delayMs }) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.mkdirSync(path.dirname(metaPath), { recursive: true });

  const outStream = fs.createWriteStream(outPath, { flags: "w" });

  let pageUrl = url;
  let pageCount = 0;
  let itemCount = 0;

  // aggregate list-level fields as we go
  const allWarnings = [];
  let totalCards = null;

  const startedAt = new Date().toISOString();

  while (pageUrl) {
    pageCount++;

    const page = await fetchJson(pageUrl);

    if (page.object !== "list" || !Array.isArray(page.data)) {
      outStream.end();
      throw new Error(
        `Expected a Scryfall List object at ${pageUrl}, got: ${JSON.stringify(
          { object: page.object, has_data_array: Array.isArray(page.data) },
          null,
          2
        )}`
      );
    }

    // List-level optional fields
    if (typeof page.total_cards === "number") totalCards = page.total_cards;
    if (Array.isArray(page.warnings)) {
      for (const w of page.warnings) allWarnings.push(w);
    }

    // Stream each item to JSONL
    for (const obj of page.data) {
      outStream.write(JSON.stringify(obj) + "\n");
      itemCount++;
    }

    const hasMore = !!page.has_more;
    const nextPage = page.next_page || null;

    console.log(
      `[Scryfall] Page ${pageCount}: +${page.data.length} items (total streamed: ${itemCount})` +
        (typeof totalCards === "number" ? ` / total_cards: ${totalCards}` : "") +
        (hasMore ? ` | has_more -> next_page` : ` | done`)
    );

    if (hasMore) {
      if (!nextPage) {
        outStream.end();
        throw new Error(`List said has_more=true but next_page was null on page ${pageCount}`);
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
    object: "list_run_meta",
    requested_url: url,
    started_at: startedAt,
    finished_at: finishedAt,
    pages_fetched: pageCount,
    items_streamed: itemCount,
    total_cards: totalCards,          // nullable (only present for card searches)
    warnings: allWarnings.length ? allWarnings : null,
    outputs: {
      jsonl: outPath,
    },
  };

  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf8");

  console.log(`\n✅ Done`);
  console.log(`   JSONL: ${outPath}`);
  console.log(`   META: ${metaPath}`);
  if (meta.warnings) {
    console.log(`\n⚠️ Warnings:`);
    for (const w of meta.warnings) console.log(` - ${w}`);
  }

  return meta;
}

// --- main ---
(async function main() {
  const args = parseArgs(process.argv);

  const url = args.url;
  if (!url) {
    console.error(`Missing --url\nExample:\n  node scripts/scryfall_list_paginator.js --url "https://api.scryfall.com/cards/search?q=c%3Awhite+mv%3D1"`);
    process.exit(1);
  }

  const outPath = args.out || "./out/scryfall.list.data.jsonl";
  const metaPath = args.meta || "./out/scryfall.list.meta.json";
  const delayMs = Number.isFinite(Number(args.delay)) ? Number(args.delay) : 120;

  try {
    await paginateListToJsonl({ url, outPath, metaPath, delayMs });
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    process.exit(1);
  }
})();
