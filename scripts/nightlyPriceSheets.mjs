 
import "dotenv/config";
import { request } from "undici";
const BASE = process.env.PRO_BASE_URL || "https://legendary-collectibles.com";

// Pull one global Yu-Gi-Oh! sheet (all sets)
async function run() {
  const url = `${BASE}/api/pro/exports/prices?game=yugioh`;
  const res = await request(url, { method: "GET" });
  if (res.statusCode !== 200) throw new Error(`HTTP ${res.statusCode}`);
  // If you want to persist to disk, write res.body to a file here.
  console.log("Nightly price sheet built", new Date().toISOString());
}
run().catch(err => { console.error(err); process.exit(1); });
