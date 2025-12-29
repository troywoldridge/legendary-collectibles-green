#!/usr/bin/env node
// scripts/pokemontcg/test_query.mjs
import "dotenv/config";

const API_BASE = "https://api.pokemontcg.io/v2";
const API_KEY = process.env.POKEMON_TCG_API_KEY || "";

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
PokemonTCG Query Tester

Examples:
  node scripts/pokemontcg/test_query.mjs --q 'set.updatedAt:"2025/12/27*"' --pageSize 5
  node scripts/pokemontcg/test_query.mjs --q 'rarity:"Rare Holo EX"' --select 'id,name,set.id,set.updatedAt'
  node scripts/pokemontcg/test_query.mjs --q 'set.id:xy1' --orderBy '-set.updatedAt' --pageSize 5

Options:
  --q        "<query>"     Required (unless you pass it as trailing text)
  --orderBy  "<field(s)>"  e.g. '-set.updatedAt' or 'name'
  --select   "<fields>"    e.g. 'id,name,tcgplayer,cardmarket'
  --page     <int>         default 1
  --pageSize <int>         default 5 (max 250)
`.trim());
}

const args = parseArgs(process.argv);

// allow either --q "...", or trailing text as q
const q = String(args.q || args._.join(" ") || "").trim();
if (!q) {
  usage();
  process.exit(1);
}

const page = String(args.page || "1");
const pageSize = String(args.pageSize || "5");

const params = new URLSearchParams({
  q,
  page,
  pageSize,
});

if (args.orderBy) params.set("orderBy", String(args.orderBy));
if (args.select) params.set("select", String(args.select));

const url = `${API_BASE}/cards?${params.toString()}`;

const res = await fetch(url, {
  headers: {
    Accept: "application/json",
    ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
  },
});

const rawText = await res.text();
let json = null;
try {
  json = JSON.parse(rawText);
} catch {
  // leave json as null
}

console.log("URL:", url);
console.log("Status:", res.status, res.statusText);
console.log("Content-Type:", res.headers.get("content-type") || "(none)");

if (!res.ok) {
  // show the actual API error
  if (json && typeof json === "object") {
    console.log("Error JSON:", JSON.stringify(json, null, 2));
  } else {
    console.log("Error body (non-JSON):", rawText.slice(0, 2000));
  }
  process.exit(1);
}

if (!json || typeof json !== "object") {
  console.log("Response was not JSON (unexpected). First bytes:", rawText.slice(0, 500));
  process.exit(1);
}

console.log("Keys:", Object.keys(json));
console.log(
  "totalCount:",
  typeof json.totalCount === "number" ? json.totalCount : "(missing)"
);

const data = Array.isArray(json.data) ? json.data : [];
console.log("Returned:", data.length);

const sample = data.slice(0, Math.min(5, data.length)).map((c) => ({
  id: c?.id ?? null,
  name: c?.name ?? null,
  "set.id": c?.set?.id ?? null,
  "set.updatedAt": c?.set?.updatedAt ?? null,
  "tcgplayer.updatedAt": c?.tcgplayer?.updatedAt ?? null,
  "cardmarket.updatedAt": c?.cardmarket?.updatedAt ?? null,
}));

console.log("Sample:", JSON.stringify(sample, null, 2));
