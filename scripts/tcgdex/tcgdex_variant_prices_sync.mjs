#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * scripts/tcgdex/tcgdex_variant_prices_sync.mjs
 *
 * Pull ONLY variant prices from TCGdex and upsert into tcg_card_prices_tcgplayer.
 *
 * ✅ Uses correct TCGdex endpoint for ids like "swsh3-136":
 *    https://api.tcgdex.net/v2/en/sets/{setId}/{localId}
 * ✅ Safe concurrency via pg.Pool
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

const API_BASE = "https://api.tcgdex.net/v2/en";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function numOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * TCGdex returns variants like: normal, reverse, holo, wPromo, firstEdition, etc.
 * We skip normal on purpose.
 */
function mapKeyToVariantType(key) {
  const k = String(key || "").trim().toLowerCase();
  if (k === "reverse") return "reverse_holofoil";
  if (k === "holo" || k === "holofoil") return "holofoil";
  if (k === "firstedition" || k === "first_edition") return "first_edition";
  if (k === "wpromo" || k === "w_promo" || k === "promo") return "promo";
  return null;
}

function splitSetAndLocal(cardId) {
  const s = String(cardId || "");
  const idx = s.indexOf("-");
  if (idx <= 0 || idx === s.length - 1) return null;
  return { setId: s.slice(0, idx), localId: s.slice(idx + 1) };
}

async function fetchJsonWithRetry(url, tries = 6) {
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });

      // 404 = not in TCGdex dataset; treat as "skip"
      if (res.status === 404) return { __notFound: true };

      if (res.status === 429) {
        await sleep(900 + i * 700);
        continue;
      }
      if (res.status >= 500) {
        await sleep(650 + i * 550);
        continue;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.statusText} :: ${text.slice(0, 200)}`);
      }

      return await res.json();
    } catch (e) {
      lastErr = e;
      await sleep(350 + i * 500);
    }
  }
  throw lastErr ?? new Error("fetch failed");
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

  if (!hasVariantType) {
    console.error(
      `❌ Your tcg_card_prices_tcgplayer table is missing "variant_type".\n` +
        `This script expects the multi-row schema: UNIQUE(card_id, variant_type).`
    );
    process.exit(1);
  }

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
  let notFound = 0;
  let badId = 0;
  let errors = 0;

  let cursor = 0;

  async function processOneCard(cardId) {
    const parts = splitSetAndLocal(cardId);
    if (!parts) return { didAny: false, badId: true };

    const url = `${API_BASE}/sets/${encodeURIComponent(parts.setId)}/${encodeURIComponent(parts.localId)}`;
    const card = await fetchJsonWithRetry(url);

    if (card?.__notFound) return { didAny: false, notFound: true };

    const pricing = card?.pricing?.tcgplayer;
    if (!pricing || typeof pricing !== "object") return { didAny: false };

    const updated = pricing.updated ? String(pricing.updated) : null;
    const unit = pricing.unit ? String(pricing.unit) : "USD";

    const variantEntries = Object.entries(pricing).filter(
      ([, v]) => typeof v === "object" && v !== null,
    );

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

  async function worker(workerId) {
    while (true) {
      const start = cursor;
      cursor += BATCH;
      const slice = ids.slice(start, start + BATCH);
      if (!slice.length) return;

      for (const cardId of slice) {
        try {
          const r = await processOneCard(cardId);

          if (r.badId) badId++;
          else if (r.notFound) notFound++;
          else if (r.didAny) upserts += r.upsertCount || 1;
          else skippedNoPricing++;

          processed++;

          if (processed % 75 === 0) await sleep(60);
        } catch (e) {
          errors++;
          processed++;
          if (errors <= 25) {
            console.warn(`[tcgdex] worker ${workerId} error card=${cardId}:`, e?.message || e);
          }
        }

        if (processed % 500 === 0) {
          console.log(
            `[tcgdex] progress ${processed}/${ids.length} upserts=${upserts} skipped=${skippedNoPricing} notFound=${notFound} badId=${badId} errors=${errors}`,
          );
        }
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1));
  await Promise.all(workers);

  console.log(
    `[tcgdex] done processed=${processed} upserts=${upserts} skipped=${skippedNoPricing} notFound=${notFound} badId=${badId} errors=${errors}`,
  );

  await pool.end();
}

main().catch((e) => {
  console.error("❌ fatal:", e?.stack || e?.message || e);
  process.exit(1);
});
