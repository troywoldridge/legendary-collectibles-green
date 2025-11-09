import fs from "node:fs/promises";
import path from "node:path";

const FILE = path.resolve(process.cwd(), ".scryfall-sync.checkpoint.json");

export async function loadCheckpoint() {
  try { return JSON.parse(await fs.readFile(FILE, "utf8")); }
  catch { return null; }
}

export async function saveCheckpoint(cp) {
  cp.updatedAt = new Date().toISOString();
  await fs.writeFile(FILE, JSON.stringify(cp, null, 2));
}

export function newCheckpoint() {
  return {
    phase: "cards",
    scryfallNext: null,    // set to next_page from Scryfall to resume
    totalInserted: 0,
    batchesCommitted: 0,
    lastBatchCount: 0,
    lastId: null
  };
}
