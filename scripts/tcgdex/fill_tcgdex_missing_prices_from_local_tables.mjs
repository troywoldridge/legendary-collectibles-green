#!/usr/bin/env node
/**
 * scripts/tcgdex/fill_tcgdex_missing_prices_from_local_tables.mjs
 *
 * Fill missing pricing blocks in public.tcgdex_cards.raw_json using LOCAL tables:
 *  - public.pokemon_card_id_map (tcgdex_id -> legacy_id)
 *  - public.tcg_card_prices_tcgplayer (card_id + variant_type rows)
 *  - public.tcg_card_prices_cardmarket (card_id single row)
 *
 * Env:
 *  - DATABASE_URL (required)
 *  - LIMIT (default 5000)
 *  - DRY_RUN (0/1)
 *
 * Behavior:
 *  - Only writes pricing blocks that are missing (non-object / null).
 *  - Adds/merges raw_json.pricing._sources with provenance.
 */

import process from "node:process";
import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("Missing DATABASE_URL");

const LIMIT = clampInt(process.env.LIMIT, 5000, 1, 200000);
const DRY_RUN = toBool(process.env.DRY_RUN);

function clampInt(v, fallback, min, max) {
  const n = Number(String(v ?? ""));
  if (!Number.isFinite(n)) return fallback;
  const m = Math.floor(n);
  if (m < min) return fallback;
  return Math.min(m, max);
}

function toBool(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function isObj(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

function numOrNull(v) {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).trim();
  if (!s) return null;
  // cardmarket stores many numerics as text
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function nowIso() {
  return new Date().toISOString();
}

function mapVariantTypeToTcgdexKey(variantType) {
  const vt = String(variantType ?? "").trim().toLowerCase();
  if (!vt) return null;

  // Your table has both "variant_type" and columns for finishes;
  // We'll prioritize variant_type mapping.
  if (vt === "normal") return "normal";
  if (vt === "holofoil") return "holofoil";
  if (vt === "reverse_holofoil" || vt === "reverse-holofoil") return "reverse-holofoil";
  if (vt === "first_edition_holofoil" || vt === "1st_edition_holofoil" || vt === "1st-edition-holofoil")
    return "1st-edition-holofoil";
  if (vt === "first_edition_normal" || vt === "1st_edition_normal" || vt === "1st-edition-normal")
    return "1st-edition-normal";

  // Some pipelines use these:
  if (vt === "reverseholofoil") return "reverse-holofoil";
  if (vt === "1steditionholofoil") return "1st-edition-holofoil";
  if (vt === "1steditionnormal") return "1st-edition-normal";

  // Fallback: ignore unknown variant types
  return null;
}

function buildTcgplayerBlock(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  // pick newest updated_at (text) by lexicographic if ISO, else first non-empty
  let updated = null;
  for (const r of rows) {
    const u = String(r.updated_at ?? "").trim();
    if (!u) continue;
    if (!updated) updated = u;
    else if (u > updated) updated = u;
  }

  const unit = (String(rows[0]?.currency ?? "USD").trim() || "USD").toUpperCase();

  const out = { unit, updated: updated || null };

  for (const r of rows) {
    const key = mapVariantTypeToTcgdexKey(r.variant_type);
    if (!key) continue;

    const marketPrice = numOrNull(r.market_price);
    const lowPrice = numOrNull(r.low_price);
    const midPrice = numOrNull(r.mid_price);
    const highPrice = numOrNull(r.high_price);

    // Some of your older pipelines might store strings in finish columns (normal/holofoil/etc).
    // We ignore those because you already have numeric columns above.

    if ([marketPrice, lowPrice, midPrice, highPrice].every((x) => x == null)) continue;

    out[key] = { marketPrice, lowPrice, midPrice, highPrice, directLowPrice: null };
  }

  const keys = Object.keys(out).filter((k) => k !== "unit" && k !== "updated");
  if (!keys.length) return null;

  return out;
}

function buildCardmarketBlock(row) {
  if (!row || typeof row !== "object") return null;

  const updated = String(row.updated_at ?? "").trim() || null;

  const avg = numOrNull(row.average_sell_price);
  const low = numOrNull(row.low_price);
  const trend = numOrNull(row.trend_price);

  const avg1 = numOrNull(row.avg1);
  const avg7 = numOrNull(row.avg7);
  const avg30 = numOrNull(row.avg30);

  const reverse_holo_sell = numOrNull(row.reverse_holo_sell);
  const reverse_holo_low = numOrNull(row.reverse_holo_low);
  const reverse_holo_trend = numOrNull(row.reverse_holo_trend);

  const reverse_holo_avg1 = numOrNull(row.reverse_holo_avg1);
  const reverse_holo_avg7 = numOrNull(row.reverse_holo_avg7);
  const reverse_holo_avg30 = numOrNull(row.reverse_holo_avg30);

  // If literally nothing usable, bail
  const any =
    avg != null ||
    low != null ||
    trend != null ||
    avg1 != null ||
    avg7 != null ||
    avg30 != null ||
    reverse_holo_sell != null ||
    reverse_holo_low != null ||
    reverse_holo_trend != null ||
    reverse_holo_avg1 != null ||
    reverse_holo_avg7 != null ||
    reverse_holo_avg30 != null;

  if (!any) return null;

  const out = { unit: "EUR", updated };

  // Standard (tcgdex-like)
  if (avg != null) out.avg = avg;
  if (low != null) out.low = low;
  if (trend != null) out.trend = trend;
  if (avg1 != null) out.avg1 = avg1;
  if (avg7 != null) out.avg7 = avg7;
  if (avg30 != null) out.avg30 = avg30;

  // Reverse holo mirrors tcgdex naming pattern from your sample (avg-holo, etc.)
  // Your sample uses "avg-holo"/"low-holo"/"trend-holo" etc.
  if (reverse_holo_sell != null) out["avg-holo"] = reverse_holo_sell;
  if (reverse_holo_low != null) out["low-holo"] = reverse_holo_low;
  if (reverse_holo_trend != null) out["trend-holo"] = reverse_holo_trend;
  if (reverse_holo_avg1 != null) out["avg1-holo"] = reverse_holo_avg1;
  if (reverse_holo_avg7 != null) out["avg7-holo"] = reverse_holo_avg7;
  if (reverse_holo_avg30 != null) out["avg30-holo"] = reverse_holo_avg30;

  return out;
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  console.log(`[local-fill] limit=${LIMIT} dryRun=${DRY_RUN}`);
  console.log(`[local-fill] mapping: pokemon_card_id_map.tcgdex_id -> pokemon_card_id_map.legacy_id`);
  console.log(`[local-fill] sources: tcg_card_prices_tcgplayer + tcg_card_prices_cardmarket`);

  // Pull candidates missing tcgplayer OR cardmarket object
  const cand = await pool.query(
    `
    SELECT id::text AS tcgdex_id, raw_json
    FROM public.tcgdex_cards
    WHERE raw_json IS NOT NULL
      AND (
        jsonb_typeof(raw_json->'pricing'->'tcgplayer') IS DISTINCT FROM 'object'
        OR jsonb_typeof(raw_json->'pricing'->'cardmarket') IS DISTINCT FROM 'object'
      )
    ORDER BY id ASC
    LIMIT $1
    `,
    [LIMIT]
  );

  let processed = 0;
  let mapped = 0;
  let patched = 0;

  let skippedNoMap = 0;
  let skippedNoLocalPrices = 0;
  let errors = 0;

  for (const r of cand.rows) {
    processed++;
    const tcgdexId = String(r.tcgdex_id);
    const raw = r.raw_json;

    const needsTcgplayer = !isObj(raw?.pricing?.tcgplayer);
    const needsCardmarket = !isObj(raw?.pricing?.cardmarket);

    // map tcgdex -> legacy_id
    const m = await pool.query(
      `SELECT legacy_id FROM public.pokemon_card_id_map WHERE tcgdex_id = $1 LIMIT 1`,
      [tcgdexId]
    );

    const legacyId = m.rows?.[0]?.legacy_id ? String(m.rows[0].legacy_id) : null;
    if (!legacyId) {
      skippedNoMap++;
      continue;
    }
    mapped++;

    // Read local prices
    let tcgRows = [];
    let cmRow = null;

    try {
      if (needsTcgplayer) {
        const q = `
          SELECT card_id, updated_at, variant_type, currency, low_price, mid_price, high_price, market_price
          FROM public.tcg_card_prices_tcgplayer
          WHERE card_id = $1
        `;
        const rr = await pool.query(q, [legacyId]);
        tcgRows = rr.rows || [];
      }

      if (needsCardmarket) {
        const q = `SELECT * FROM public.tcg_card_prices_cardmarket WHERE card_id = $1 LIMIT 1`;
        const rr = await pool.query(q, [legacyId]);
        cmRow = rr.rows?.[0] ?? null;
      }
    } catch (e) {
      errors++;
      console.error(`[local-fill] price read error tcgdex=${tcgdexId} legacy=${legacyId}: ${String(e?.message || e)}`);
      continue;
    }

    const tcgplayerBlock = needsTcgplayer ? buildTcgplayerBlock(tcgRows) : null;
    const cardmarketBlock = needsCardmarket ? buildCardmarketBlock(cmRow) : null;

    if (!tcgplayerBlock && !cardmarketBlock) {
      skippedNoLocalPrices++;
      continue;
    }

    if (DRY_RUN) {
      patched++;
      continue;
    }

    // Patch only missing blocks
    await pool.query(
      `
      UPDATE public.tcgdex_cards
      SET raw_json =
        jsonb_set(
          jsonb_set(
            COALESCE(raw_json, '{}'::jsonb),
            '{pricing,tcgplayer}',
            CASE
              WHEN jsonb_typeof(raw_json->'pricing'->'tcgplayer') IS DISTINCT FROM 'object'
                   AND $2::jsonb IS NOT NULL
                THEN $2::jsonb
              ELSE raw_json->'pricing'->'tcgplayer'
            END,
            true
          ),
          '{pricing,cardmarket}',
          CASE
            WHEN jsonb_typeof(raw_json->'pricing'->'cardmarket') IS DISTINCT FROM 'object'
                 AND $3::jsonb IS NOT NULL
              THEN $3::jsonb
            ELSE raw_json->'pricing'->'cardmarket'
          END,
          true
        )
      WHERE id::text = $1::text
      `,
      [
        tcgdexId,
        tcgplayerBlock ? JSON.stringify(tcgplayerBlock) : null,
        cardmarketBlock ? JSON.stringify(cardmarketBlock) : null,
      ]
    );

    const sources = {
      patchedAt: nowIso(),
      tcgplayer: tcgplayerBlock ? "local.tcg_card_prices_tcgplayer" : undefined,
      cardmarket: cardmarketBlock ? "local.tcg_card_prices_cardmarket" : undefined,
      legacyId,
    };
    Object.keys(sources).forEach((k) => sources[k] === undefined && delete sources[k]);

    await pool.query(
      `
      UPDATE public.tcgdex_cards
      SET raw_json = jsonb_set(
        raw_json,
        '{pricing,_sources}',
        (COALESCE(raw_json->'pricing'->'_sources', '{}'::jsonb) || $2::jsonb),
        true
      )
      WHERE id::text = $1::text
      `,
      [tcgdexId, JSON.stringify(sources)]
    );

    patched++;
  }

  console.log(
    JSON.stringify(
      {
        ok: errors === 0,
        processed,
        mapped,
        patched,
        skippedNoMap,
        skippedNoLocalPrices,
        errors,
      },
      null,
      2
    )
  );

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});