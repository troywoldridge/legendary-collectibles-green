#!/usr/bin/env node
/**
 * imagesPromote.mjs
 * Auto-match & promote staged images from sc_image_candidates into sc_images.
 *
 * ENV:
 *   DATABASE_URL=postgres://user:pass@host/db
 *   CF_IMAGES_ACCOUNT=... (optional)
 *   CF_IMAGES_TOKEN=...   (optional)
 *
 * CLI flags:
 *   --limit=500           how many candidates to attempt this run
 *   --min-score=0.78      minimum score to auto-promote
 *   --min-margin=0.12     top - second score needed to consider "unambiguous"
 *   --dry-run=1           don’t write, just print actions
 *
 * scoring (0..~1.0):
 *   +0.45  exact number match
 *   + up to 0.40 trigram similarity(player, candidate.player)
 *   +0.10  Jaccard token overlap for set_name (if both exist)
 *   +0.05  year within ±2 (or +0.02 within ±4)
 */

import * as dotenv from "dotenv";
dotenv.config();

import pg from "pg";
const { Client } = pg;

const argv = Object.fromEntries(process.argv.slice(2).map(kv => {
  const [k,v] = kv.replace(/^--/,'').split('=');
  return [k, v === undefined ? true : v];
}));

const BATCH_LIMIT  = parseInt(argv.limit ?? "500", 10);
const MIN_SCORE    = parseFloat(argv["min-score"] ?? "0.78");
const MIN_MARGIN   = parseFloat(argv["min-margin"] ?? "0.12");
const DRY_RUN      = String(argv["dry-run"] ?? "0") === "1";

const CF_ACC   = process.env.CF_IMAGES_ACCOUNT;
const CF_TOKEN = process.env.CF_IMAGES_TOKEN;

function log(...a){ console.log(...a); }
function slog(level, action, candidateId, cardId, message){
  return { text: `[${level}] ${action} cand=${candidateId ?? "-"} card=${cardId ?? "-"} :: ${message ?? ""}`, row: { level, action, candidate_id: candidateId ?? null, card_id: cardId ?? null, message } };
}

function jaccardTokens(a, b) {
  const A = new Set((a||"").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const B = new Set((b||"").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

async function cfUploadByUrl(srcUrl){
  if (!CF_ACC || !CF_TOKEN) return null;
  try {
    const fd = new FormData();
    fd.set("url", srcUrl);
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACC}/images/v1`, {
      method: "POST",
      headers: { Authorization: `Bearer ${CF_TOKEN}` },
      body: fd
    });
    const j = await r.json();
    return j?.success ? (j.result?.id || null) : null;
  } catch { return null; }
}

async function main(){
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // pull a batch of candidates; prioritize those with more metadata
  const { rows: candidates } = await client.query(`
    SELECT *
    FROM sc_image_candidates
    ORDER BY
      (player IS NOT NULL)::int DESC,
      (number IS NOT NULL)::int DESC,
      (year IS NOT NULL)::int DESC,
      id ASC
    LIMIT $1
  `, [BATCH_LIMIT]);

  if (!candidates.length){
    log("No candidates to process.");
    await client.end();
    return;
  }

  let promoted = 0, skipped = 0, errored = 0;

  for (const c of candidates){
    const sports = c.sport ? [c.sport] : ['baseball','basketball','football'];
    const year   = c.year ? Number(c.year) : null;
    const setnm  = c.set_name || "";
    const player = c.player || "";
    const number = c.number || "";

    // pull small candidate list from sc_cards for scoring
    const { rows: pool } = await client.query(`
      SELECT id, sport, year, set_name, number, player,
             similarity(player, $1) AS player_sim
      FROM sc_cards
      WHERE sport = ANY($2)
        AND ($3::int IS NULL OR (year IS NOT NULL AND ABS(year - $3::int) <= 4))
        AND ($4::text = '' OR set_name ILIKE '%'||$4||'%')
      ORDER BY player_sim DESC NULLS LAST
      LIMIT 200
    `, [player, sports, year, setnm]);

    if (!pool.length){
      const L = slog('info', 'skip', c.id, null, 'no pool');
      log(L.text); 
      if (!DRY_RUN) await client.query(`INSERT INTO sc_image_logs(level,action,candidate_id,card_id,message) VALUES($1,$2,$3,$4,$5)`, Object.values(L.row));
      skipped++;
      continue;
    }

    // score each
    const scored = pool.map(row => {
      let s = 0;
      if (number && row.number && String(number) === String(row.number)) s += 0.45;
      // player trigram (0..1.0 approx) weight 0.40 max
      const ps = Math.min(1, Number(row.player_sim || 0));
      s += Math.min(0.40, ps * 0.40);

      // set token Jaccard (0..1) weight 0.10
      const sj = jaccardTokens(setnm, row.set_name || "");
      s += Math.min(0.10, sj * 0.10);

      // year closeness
      if (year && row.year){
        const d = Math.abs(year - row.year);
        if (d <= 2) s += 0.05;
        else if (d <= 4) s += 0.02;
      }

      return { ...row, score: s };
    }).sort((a,b) => b.score - a.score);

    const top = scored[0];
    const second = scored[1];
    const margin = top ? top.score - (second?.score ?? 0) : 0;

    if (!top || top.score < MIN_SCORE || margin < MIN_MARGIN){
      const msg = !top ? 'no top' : `low-confidence score=${top?.score?.toFixed(3)} margin=${margin.toFixed(3)}`;
      const L = slog('info', 'skip', c.id, null, msg);
      log(L.text);
      if (!DRY_RUN) await client.query(`INSERT INTO sc_image_logs(level,action,candidate_id,card_id,message) VALUES($1,$2,$3,$4,$5)`, Object.values(L.row));
      skipped++;
      continue;
    }

    // Optional: upload to Cloudflare Images first so we can store the id
    let cfId = null;
    if (CF_ACC && CF_TOKEN && c.src_url){
      try { cfId = await cfUploadByUrl(c.src_url); } catch {/*ignore*/}
      if (cfId && !DRY_RUN){
        await client.query(`UPDATE sc_image_candidates SET cf_image_id=$1 WHERE id=$2`, [cfId, c.id]);
      }
    }

    if (DRY_RUN){
      const L = slog('info', 'would-promote', c.id, top.id, `score=${top.score.toFixed(3)} margin=${margin.toFixed(3)}`);
      log(L.text);
      continue;
    }

    try {
      // call helper to move row into sc_images (sets is_primary smartly)
      const { rows } = await client.query(`SELECT sc_promote_candidate($1,$2,$3) AS image_id`, [c.id, top.id, true]);
      const newId = rows[0]?.image_id || null;
      const L = slog('info', 'promote', c.id, top.id, `image_id=${newId} score=${top.score.toFixed(3)} margin=${margin.toFixed(3)}`);
      log(L.text);
      await client.query(`INSERT INTO sc_image_logs(level,action,candidate_id,card_id,message) VALUES($1,$2,$3,$4,$5)`, Object.values(L.row));
      promoted++;
    } catch (e) {
      const L = slog('error', 'error', c.id, top.id, e.message);
      console.error(L.text);
      await client.query(`INSERT INTO sc_image_logs(level,action,candidate_id,card_id,message) VALUES($1,$2,$3,$4,$5)`, Object.values(L.row));
      errored++;
    }
  }

  log(`\nPromotion run complete.
Promoted: ${promoted}
Skipped:  ${skipped}
Errored:  ${errored}`);
  await client.end();
}

main().catch(e => { console.error("Fatal:", e?.stack || e); process.exit(1); });
