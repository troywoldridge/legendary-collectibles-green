#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * scripts/tcgdex/tcgdex_variant_prices_sync.mjs
 *
 * Pull ONLY variant prices from TCGdex and upsert into tcg_card_prices_tcgplayer.
 *
 * ✅ Safe concurrency via pg.Pool (no shared Client).
 * ✅ Schema-aware:
 *    - If table has column "variant_type": uses multi-row schema (card_id, variant_type) unique
 *    - Else: uses legacy single-row schema (card_id unique) and only updates holofoil/reverse_holofoil
 * ✅ Skips "normal" on purpose.
 *
 * Usage:
 *   node scripts/tcgdex/tcgdex_variant_prices_sync.mjs
 *   node scripts/tcgdex/tcgdex_variant_prices_sync.mjs --limit 5000
 *   node scripts/tcgdex/tcgdex_variant_prices_sync.mjs --concurrency 8
 *   node scripts/tcgdex/tcgdex_variant_prices_sync.mjs --batch 250
 *
 * Env:
 *   DATABASE_URL (required)
 */

import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("❌ Missing DATABASE_URL");
  process.exit(1);
}

function argValue(name, def) {
  const i = process.argv.indexOf(name);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v ?? def;
}

const LIMIT = Number(argValue("--limit", "0")) || 0; // 0 = all
const CONCURRENCY = Math.max(1, Number(argValue("--concurrency", "6")) || 6);
const BATCH = Math.max(50, Math.min(2000, Number(argValue("--batch", "500")) || 500));

const API_BASE = "https://api.tcgdex.net/v2/en/cards";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJsonWithRetry(url, tries = 6) {
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });

      if (res.status === 429) {
        const wait = 800 + i * 600;
        await sleep(wait);
        continue;
      }

      if (res.status >= 500) {
        const wait = 600 + i * 500;
        await sleep(wait);
        continue;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.statusText} :: ${text.slice(0, 200)}`);
      }

      return await res.json();
    } catch (e) {
      lastErr = e;
      await sleep(300 + i * 450);
    }
  }
  throw lastErr ?? new Error("fetch failed");
}

function numOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Map TCGdex pricing keys -> your DB variant_type strings.
 * We skip normal on purpose.
 */
function mapKeyToVariantType(key) {
  const k = String(key || "").trim().toLowerCase();

  if (k === "reverse") return "reverse_holofoil";
  if (k === "holo" || k === "holofoil") return "holofoil";

  // Optional future mappings
  if (k === "firstedition" || k === "first_edition") return "first_edition";
  if (k === "promo" || k === "wpromo" || k === "w_promo") return "promo";

  return null;
}

async function tableColumns(pool, tableName) {
  const res = await pool.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name=$1
  `,
    [tableName],
  );
  return new Set(res.rows.map((r) => r.column_name));
}

async function main() {
  const pool = new Pool({
    connectionString: DB_URL,
    max: Math.max(4, CONCURRENCY + 2),
  });

  console.log(`[tcgdex] start: concurrency=${CONCURRENCY} batch=${BATCH} limit=${LIMIT || "ALL"}`);

  const cols = await tableColumns(pool, "tcg_card_prices_tcgplayer");
  const hasVariantType = cols.has("variant_type");

  console.log(
    `[tcgdex] tcg_card_prices_tcgplayer schema = ${
      hasVariantType ? "MULTI-ROW (card_id, variant_type)" : "LEGACY (single row per card)"
    }`,
  );

  // Pull ids from tcg_cards
  const idsRes = await pool.query(
    `
    SELECT id
    FROM public.tcg_cards
    WHERE id IS NOT NULL
    ORDER BY id
    ${LIMIT ? "LIMIT $1" : ""}
  `,
    LIMIT ? [LIMIT] : [],
  );
  const ids = idsRes.rows.map((r) => String(r.id));
  console.log(`[tcgdex] cards to process: ${ids.length}`);

  let processed = 0;
  let upserts = 0;
  let skippedNoPricing = 0;
  let errors = 0;

  let cursor = 0;

  async function processOneCard(cardId) {
    const url = `${API_BASE}/${encodeURIComponent(cardId)}`;
    const card = await fetchJsonWithRetry(url);

    const pricing = card?.pricing?.tcgplayer;
    if (!pricing || typeof pricing !== "object") return { didAny: false };

    const updated = pricing.updated ? String(pricing.updated) : null;
    const unit = pricing.unit ? String(pricing.unit) : "USD";

    const variantEntries = Object.entries(pricing).filter(
      ([k, v]) => typeof v === "object" && v !== null,
    );

    if (!variantEntries.length) return { didAny: false };

    if (hasVariantType) {
      // MULTI-ROW schema: insert many rows in one upsert
      const rows = [];

      for (const [k, v] of variantEntries) {
        const variantType = mapKeyToVariantType(k);
        if (!variantType) continue;

        const low = numOrNull(v.lowPrice ?? v.low ?? null);
        const mid = numOrNull(v.midPrice ?? v.mid ?? null);
        const high = numOrNull(v.highPrice ?? v.high ?? null);
        const market = numOrNull(v.marketPrice ?? v.market ?? null);

        if (low == null && mid == null && high == null && market == null) continue;

        rows.push({
          card_id: cardId,
          variant_type: variantType,
          updated_at: updated,
          currency: unit,
          low_price: low,
          mid_price: mid,
          high_price: high,
          market_price: market,
        });
      }

      if (!rows.length) return { didAny: false };

      // Build VALUES list
      const params = [];
      const valuesSql = rows
        .map((r, i) => {
          const b = i * 8;
          params.push(
            r.card_id,
            r.variant_type,
            r.updated_at,
            r.currency,
            r.low_price,
            r.mid_price,
            r.high_price,
            r.market_price,
          );
          return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8})`;
        })
        .join(",");

      await pool.query(
        `
        INSERT INTO public.tcg_card_prices_tcgplayer
          (card_id, variant_type, updated_at, currency, low_price, mid_price, high_price, market_price)
        VALUES ${valuesSql}
        ON CONFLICT (card_id, variant_type)
        DO UPDATE SET
          updated_at   = EXCLUDED.updated_at,
          currency     = EXCLUDED.currency,
          low_price    = EXCLUDED.low_price,
          mid_price    = EXCLUDED.mid_price,
          high_price   = EXCLUDED.high_price,
          market_price = EXCLUDED.market_price
      `,
        params,
      );

      return { didAny: true, upsertCount: rows.length };
    }

    // LEGACY schema: update only holofoil + reverse_holofoil fields (market/mid/low preference)
    // We never touch "normal".
    const pickLegacyPrice = (obj) => {
      if (!obj || typeof obj !== "object") return null;
      return numOrNull(obj.marketPrice ?? obj.market ?? obj.midPrice ?? obj.mid ?? obj.lowPrice ?? obj.low ?? null);
    };

    let holo = null;
    let rev = null;

    for (const [k, v] of variantEntries) {
      const vt = mapKeyToVariantType(k);
      if (vt === "holofoil") holo = pickLegacyPrice(v);
      if (vt === "reverse_holofoil") rev = pickLegacyPrice(v);
    }

    if (holo == null && rev == null) return { didAny: false };

    // Best-effort: only update columns if they exist
    const sets = [];
    const params = [cardId];
    let p = 2;

    if (cols.has("holofoil") && holo != null) {
      sets.push(`holofoil = $${p++}`);
      params.push(String(holo));
    }
    if (cols.has("reverse_holofoil") && rev != null) {
      sets.push(`reverse_holofoil = $${p++}`);
      params.push(String(rev));
    }
    if (cols.has("updated_at") && updated) {
      sets.push(`updated_at = $${p++}`);
      params.push(updated);
    }
    if (cols.has("currency") && unit) {
      sets.push(`currency = $${p++}`);
      params.push(unit);
    }

    if (!sets.length) return { didAny: false };

    await pool.query(
      `
      INSERT INTO public.tcg_card_prices_tcgplayer (card_id)
      VALUES ($1)
      ON CONFLICT (card_id) DO UPDATE SET
        ${sets.join(", ")}
    `,
      params,
    );

    return { didAny: true, upsertCount: 1 };
  }

  async function worker(workerId) {
    while (true) {
      const start = cursor;
      cursor += BATCH;
      const slice = ids.slice(start, start + BATCH);
      if (!slice.length) return;

      for (const cardId of slice) {
        try {
          const r = await processOneCard(cardId);

          if (r.didAny) upserts += r.upsertCount || 1;
          else skippedNoPricing++;

          processed++;

          // gentle pacing
          if (processed % 50 === 0) await sleep(80);
        } catch (e) {
          errors++;
          processed++;
          if (errors <= 25) {
            console.warn(`[tcgdex] worker ${workerId} error card=${cardId}:`, e?.message || e);
          }
        }

        if (processed % 500 === 0) {
          console.log(
            `[tcgdex] progress ${processed}/${ids.length} upserts=${upserts} skipped=${skippedNoPricing} errors=${errors}`,
          );
        }
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1));
  await Promise.all(workers);

  console.log(
    `[tcgdex] done processed=${processed} upserts=${upserts} skipped=${skippedNoPricing} errors=${errors}`,
  );

  await pool.end();
}

main().catch((e) => {
  console.error("❌ fatal:", e?.stack || e?.message || e);
  process.exit(1);
});
