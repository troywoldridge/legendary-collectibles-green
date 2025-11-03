import "dotenv/config";
import { Pool } from "pg";

// ----------- config -----------
const BATCH = 150;              // rows per DB batch
const PER_POP_ATTEMPTS = 2;     // # of search rounds per pop (primary + fallback)
const SEARCH_COUNT = 12;        // images to fetch per query

const WHITELIST_HOSTS = new Set([
  "funko.com",
  "funkoeurope.com",
  "hobbydb.com",       // Pop Price Guide runs on hobbyDB
  "hotstuff4geeks.com",
  "popinabox.com",
  "poppriceguide.com",
  "zonersp.com",       // sometimes hosts official assets mirrors
]);

// ----------- helpers -----------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const nowISO = () => new Date().toISOString();

function domainFromUrl(u) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return null; }
}

function bestCandidate(cands) {
  // prefer: whitelisted domain, larger width/height, jpeg/png, square-ish or 3:4
  const score = (c) => {
    const w = Number(c.width || 0), h = Number(c.height || 0);
    const ar = w && h ? w / h : 1;
    const host = domainFromUrl(c.contentUrl);
    let s = 0;
    if (host && WHITELIST_HOSTS.has(host)) s += 30;
    if (w >= 800 && h >= 800) s += 20;
    if (ar > 0.7 && ar < 1.5) s += 10;       // box or portrait
    if (/jpe?g|png/i.test(c.encodingFormat || "")) s += 5;
    if (/box/i.test(c.name || "")) s += 3;
    return s;
  };
  return [...cands].sort((a, b) => score(b) - score(a))[0];
}

function titleParts(row) {
  // You likely have columns: title, number, series (array or text)
  const name = (row.title || row.name || "").trim();
  const num  = (row.number || row.no || "").toString().trim();
  const series = Array.isArray(row.series) ? row.series[0] : (row.series || "");
  return { name, num, series };
}

function makeQueries(row) {
  const { name, num, series } = titleParts(row);
  const base = [];
  if (name && num) base.push(`"Funko Pop" "${name}" "#${num}"`);
  if (name)       base.push(`"Funko Pop" "${name}"`);
  if (series)     base.push(`"Funko Pop" "${series}" "${name}"`);
  if (name && num) base.push(`site:funko.com "${name}" "#${num}"`);
  if (name)        base.push(`site:funko.com "${name}"`);
  // de-dupe while keeping order
  return Array.from(new Set(base)).slice(0, 4);
}

async function bingSearch(q) {
  const key = process.env.BING_SEARCH_KEY;
  const endpoint = process.env.BING_SEARCH_ENDPOINT || "https://api.bing.microsoft.com/v7.0/images/search";
  if (!key) throw new Error("Missing BING_SEARCH_KEY");

  const url = new URL(endpoint);
  url.searchParams.set("q", q);
  url.searchParams.set("count", String(SEARCH_COUNT));
  url.searchParams.set("safeSearch", "Moderate");
  url.searchParams.set("mkt", "en-US");

  const res = await fetch(url.toString(), {
    headers: { "Ocp-Apim-Subscription-Key": key }
  });
  if (!res.ok) throw new Error(`Bing search failed ${res.status}`);
  const json = await res.json();
  return Array.isArray(json.value) ? json.value : [];
}

async function cfImportByUrl(url, meta = {}) {
  const { CF_ACCOUNT_ID, CF_API_TOKEN } = process.env;
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) return null; // allow running in "dry" mode

  const form = new FormData();
  form.set("url", url);
  form.set("metadata", JSON.stringify(meta));

  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/images/v1`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${CF_API_TOKEN}` },
    body: form
  });
  const j = await r.json();
  if (!j.success) {
    // bubble up a compact error
    throw new Error(`CF import failed: ${JSON.stringify(j.errors || j.messages || j, null, 2)}`);
  }
  return j.result?.id || null;
}

// ----------- main upsert loop -----------
async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  try {
    console.log("→ Scanning for pops missing images…");
    const totalMissing = (
      await client.query(`SELECT COUNT(*)::int AS n FROM funko_pops WHERE cf_image_id IS NULL`)
    ).rows[0].n;

    console.log(`→ Missing CF images: ${totalMissing}`);
    if (totalMissing === 0) { console.log("✓ Nothing to do."); return; }

    for (let offset = 0; offset < totalMissing; offset += BATCH) {
      const { rows } = await client.query(
        `SELECT id, handle, title, number, series, image_url, cf_image_id
           FROM funko_pops
          WHERE cf_image_id IS NULL
          ORDER BY id ASC
          LIMIT $1 OFFSET $2`,
        [BATCH, offset]
      );

      if (!rows.length) break;

      for (const row of rows) {
        const id = row.id;
        const start = Date.now();

        // If we already have a non-empty image_url, try importing that first
        let chosen = row.image_url ? [{ contentUrl: row.image_url, name: row.title, width: 0, height: 0 }] : [];

        if (chosen.length === 0) {
          const queries = makeQueries(row);
          let results = [];
          for (let i = 0; i < Math.min(PER_POP_ATTEMPTS, queries.length); i++) {
            const q = queries[i];
            try {
              const vals = await bingSearch(q);
              results.push(...vals);
              if (results.length) break; // got something
            } catch (e) {
              console.warn(`  · Bing error on "${q}": ${e.message}`);
              await sleep(250); // soft backoff
            }
          }
          if (results.length) {
            const candidate = bestCandidate(results);
            if (candidate) chosen = [candidate];
          }
        }

        if (!chosen.length) {
          await client.query(
            `UPDATE funko_pops
                SET image_status = 'no_result',
                    image_checked_at = NOW()
              WHERE id = $1`, [id]
          );
          console.log(`· #${id} — no_result (${Date.now() - start}ms)`);
          continue;
        }

        const best = chosen[0];
        const source = domainFromUrl(best.contentUrl);
        let cfId = null;
        let status = "ok";
        let thumb = best.thumbnailUrl || null;

        try {
          const meta = {
            funko_id: id,
            handle: row.handle,
            title: row.title,
            source_host: source
          };
          const cfImportedId = await cfImportByUrl(best.contentUrl, meta);
          cfId = cfImportedId || null;
        } catch (e) {
          status = "import_failed";
          console.warn(`  · CF import failed for #${id}: ${e.message}`);
        }

        await client.query(
          `UPDATE funko_pops
              SET image_url = COALESCE($2, image_url),
                  image_thumb_url = COALESCE($3, image_thumb_url),
                  image_source = COALESCE($4, image_source),
                  cf_image_id = COALESCE($5, cf_image_id),
                  image_status = $6,
                  image_meta = COALESCE(image_meta, '{}'::jsonb) || $7::jsonb,
                  image_checked_at = NOW(),
                  image_imported_at = CASE WHEN $5 IS NOT NULL THEN NOW() ELSE image_imported_at END
            WHERE id = $1`,
          [
            id,
            best.contentUrl || null,
            thumb,
            source,
            cfId,
            status,
            JSON.stringify({ picked: best, pickedAt: nowISO() })
          ]
        );

        console.log(
          `· #${id} — ${status}${cfId ? ` (cf:${cfId})` : ""} from ${source || "unknown"} (${Date.now() - start}ms)`
        );

        // Be a good API citizen
        await sleep(150);
      }
    }

    console.log("✓ Image ingestion pass complete.");
  } finally {
    client.release();
    await sleep(50);
    await pool.end();
  }
}

run().catch((e) => {
  console.error("✗ Run failed:", e);
  process.exit(1);
});
