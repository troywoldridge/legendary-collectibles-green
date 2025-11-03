import "dotenv/config";
import { Pool } from "pg";

/** ---------- tuning ---------- */
const BATCH = 150;
const PER_POP_ATTEMPTS = 3;
const SEARCH_COUNT = 20;
const BACKOFF_MS = 200;

/** Choose behavior:
 *  - import   : attempt Cloudflare Images import
 *  - url-only : never call CF; only store external URLs
 */
const CF_MODE = (process.env.CF_MODE || "").toLowerCase() || "import";

// Trust boost list (not a hard filter)
const WHITELIST_HOSTS = new Set([
  "funko.com",
  "funkoeurope.com",
  "hobbydb.com",
  "poppriceguide.com",
  "hotstuff4geeks.com",
  "popinabox.com",
  "entertainmentearth.com",
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowISO = () => new Date().toISOString();

function domainFromUrl(u) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return null; }
}
function parseSize(str) {
  if (!str) return { w: 0, h: 0 };
  const m = String(str).match(/(\d+)[×x](\d+)/i);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : { w: 0, h: 0 };
}
function scoreCandidate(c) {
  const host = domainFromUrl(c.contentUrl);
  const w = Number(c.width || 0), h = Number(c.height || 0);
  const ar = w && h ? w / h : 1;
  let s = 0;
  if (host && WHITELIST_HOSTS.has(host)) s += 30;
  if (w >= 800 && h >= 800) s += 20;
  if (ar > 0.7 && ar < 1.5) s += 10;
  if (/jpe?g|png/i.test(c.format || "")) s += 5;
  if (/box/i.test(c.title || "")) s += 3;
  return s;
}
function pickBest(cands) {
  return [...cands].sort((a, b) => scoreCandidate(b) - scoreCandidate(a))[0] || null;
}
function titleParts(row) {
  const name = (row.title || row.name || "").trim();
  const num  = (row.number || row.no || "").toString().trim();
  const series = Array.isArray(row.series) ? row.series[0] : (row.series || "");
  return { name, num, series };
}
function makeQueries(row) {
  const { name, num, series } = titleParts(row);
  const q = [];
  if (name && num) q.push(`"Funko Pop" "${name}" "#${num}"`);
  if (name)       q.push(`"Funko Pop" "${name}"`);
  if (series)     q.push(`"Funko Pop" "${series}" "${name}"`);
  if (name && num) q.push(`site:funko.com "${name}" "#${num}"`);
  if (name)        q.push(`site:funko.com "${name}"`);
  return Array.from(new Set(q)).slice(0, 5);
}

/** ----- SerpApi: Bing Images engine ----- */
async function serpapiSearchBingImages(q) {
  const key = process.env.SERPAPI_KEY;
  const endpoint = process.env.SERPAPI_ENDPOINT || "https://serpapi.com/search.json";
  if (!key) throw new Error("Missing SERPAPI_KEY");

  const params = new URLSearchParams({
    engine: "bing_images",
    q,
    api_key: key,
    device: process.env.SERPAPI_DEVICE || "desktop",
    mkt: process.env.SERPAPI_MKT || "en-US",
    count: String(SEARCH_COUNT),
    imagesize: "large",
    output: "json",
    no_cache: "false",
  });

  const url = `${endpoint}?${params.toString()}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`SerpApi ${res.status}`);
  const json = await res.json();

  const items = Array.isArray(json.images_results) ? json.images_results : [];
  return items.map((it) => {
    const { w, h } = parseSize(it.size);
    return {
      title: it.title || "",
      contentUrl: it.original || it.thumbnail || null,
      sourceUrl: it.source || it.link || null,
      domain: it.domain || (it.source ? domainFromUrl(it.source) : null),
      width: w,
      height: h,
      format: (it.original || "").split(".").pop(),
      thumbnailUrl: it.thumbnail || null,
    };
  }).filter(c => !!c.contentUrl);
}

/** ----- Cloudflare Images: import by URL ----- */
async function cfImportByUrl(url, meta = {}) {
  if (CF_MODE === "url-only") return null; // explicit skip CF

  const { CF_ACCOUNT_ID, CF_API_TOKEN } = process.env;
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) return null; // no creds => url-only behavior

  const form = new FormData();
  form.set("url", url);
  form.set("metadata", JSON.stringify(meta));

  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/images/v1`,
    { method: "POST", headers: { Authorization: `Bearer ${CF_API_TOKEN}` }, body: form }
  );
  const j = await r.json();
  if (!j.success) {
    throw new Error(`CF import failed: ${JSON.stringify(j.errors || j.messages || j, null, 2)}`);
  }
  return j.result?.id || null;
}

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const db = await pool.connect();

  try {
    const { rows: [c] } = await db.query(
      `SELECT COUNT(*)::int AS n
         FROM funko_pops
        WHERE cf_image_id IS NULL` // we always target “not imported to CF” set
    );
    const totalMissing = c.n;
    console.log(`→ Rows with no CF image: ${totalMissing} (CF_MODE=${CF_MODE})`);

    if (!totalMissing) { console.log("✓ Nothing to do."); return; }

    for (let offset = 0; offset < totalMissing; offset += BATCH) {
      const { rows } = await db.query(
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
        const t0 = Date.now();
        let status = "no_result";
        let best = null;

        // If we already have an external URL, use it; otherwise search
        if (row.image_url) {
          best = {
            title: row.title || "",
            contentUrl: row.image_url,
            sourceUrl: row.image_url,
            domain: domainFromUrl(row.image_url),
            width: 0, height: 0, format: "", thumbnailUrl: null,
          };
        } else {
          const queries = makeQueries(row);
          for (let i = 0; i < Math.min(PER_POP_ATTEMPTS, queries.length); i++) {
            try {
              const results = await serpapiSearchBingImages(queries[i]);
              if (results.length) {
                best = pickBest(results);
                if (best) break;
              }
            } catch (err) {
              console.warn(`  · SerpApi error on "${queries[i]}": ${err.message}`);
            }
            await sleep(BACKOFF_MS);
          }
        }

        if (!best) {
          await db.query(
            `UPDATE funko_pops
                SET image_status = 'no_result',
                    image_checked_at = NOW()
              WHERE id = $1`,
            [id]
          );
          console.log(`· #${id} — no_result (${Date.now() - t0}ms)`);
          continue;
        }

        // Try CF import (or skip if url-only)
        let cfId = null;
        try {
          cfId = await cfImportByUrl(best.contentUrl, {
            funko_id: id,
            handle: row.handle,
            title: row.title,
            source_host: best.domain || domainFromUrl(best.sourceUrl) || null,
          });
          status = cfId ? "ok_cf" : "ok_url"; // clearer status
        } catch (e) {
          status = "import_failed";
          console.warn(`  · CF import failed for #${id}: ${e.message}`);
        }

        const sourceHost = best.domain || domainFromUrl(best.sourceUrl) || null;

        await db.query(
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
            best.thumbnailUrl || null,
            sourceHost,
            cfId,
            status,
            JSON.stringify({ picked: best, pickedAt: nowISO() }),
          ]
        );

        const txt = status === "ok_cf" ? `cf:${cfId}` : "url-only";
        console.log(`· #${id} — ${status} (${txt}) from ${sourceHost || "unknown"} (${Date.now() - t0}ms)`);
        await sleep(BACKOFF_MS);
      }
    }

    console.log("✓ Image ingestion pass complete.");
  } finally {
    db.release();
    await pool.end();
  }
}

run().catch((e) => {
  console.error("✗ Run failed:", e);
  process.exit(1);
});
