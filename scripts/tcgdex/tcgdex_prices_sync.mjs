#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * scripts/tcgdex/tcgdex_variant_prices_sync.mjs
 *
 * Pull ONLY variant prices from TCGdex for all Pokémon cards and upsert into:
 *   public.tcg_card_prices_tcgplayer (card_id, variant_type) unique
 *
 * We intentionally skip "normal" because PokemonTCG already supplies normal pricing.
 *
 * Env:
 *   DATABASE_URL (required)
 *
 * Usage:
 *   node scripts/tcgdex/tcgdex_variant_prices_sync.mjs
 *   node scripts/tcgdex/tcgdex_variant_prices_sync.mjs --limit 5000
 *   node scripts/tcgdex/tcgdex_variant_prices_sync.mjs --concurrency 8 .... node scripts/tcgdex/tcgdex_prices_sync.mjs --concurrency 6
 */

import "dotenv/config";
import pg from "pg";

const { Client } = pg;

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("Missing DATABASE_URL");
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

/**
 * Map TCGdex pricing keys -> your DB variant_type strings.
 * We skip normal on purpose.
 */
function mapKeyToVariantType(key) {
  const k = String(key || "").trim().toLowerCase();

  // TCGdex commonly shows: normal, reverse, holo (and sometimes promo/firstEdition variants)
  if (k === "reverse") return "reverse_holofoil";
  if (k === "holo" || k === "holofoil") return "holofoil";

  // If tcgdex ever returns these keys, map them too:
  if (k === "firstedition" || k === "first_edition") return "first_edition";
  if (k === "promo" || k === "wpromo" || k === "w_promo") return "promo";

  // Ignore "normal" and unknown keys for this script
  return null;
}

function numOrNull(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJsonWithRetry(url, tries = 4) {
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { "accept": "application/json" },
      });

      if (res.status === 429) {
        // rate limit
        const wait = 750 + i * 500;
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
      await sleep(300 + i * 400);
    }
  }
  throw lastErr ?? new Error("fetch failed");
}

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  console.log(`[tcgdex] start: concurrency=${CONCURRENCY} batch=${BATCH} limit=${LIMIT || "ALL"}`);

  // Pull all pokemon card ids from your DB
  // (tcgdex card ids are like "swsh3-136", "me1-1", etc — same pattern)
  const idsRes = await client.query(
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

  // Worker pool
  let cursor = 0;

  async function worker(workerId) {
    while (true) {
      const start = cursor;
      cursor += BATCH;
      const slice = ids.slice(start, start + BATCH);
      if (!slice.length) return;

      // Process slice sequentially (but workers are parallel)
      for (const cardId of slice) {
        try {
          const url = `${API_BASE}/${encodeURIComponent(cardId)}`;
          const card = await fetchJsonWithRetry(url);

          const pricing = card?.pricing?.tcgplayer;
          if (!pricing || typeof pricing !== "object") {
            skippedNoPricing++;
            processed++;
            continue;
          }

          const updated = pricing.updated ? String(pricing.updated) : null;
          const unit = pricing.unit ? String(pricing.unit) : "USD";

          // tcgdex pricing keys are objects like:
          // pricing.tcgplayer.reverse.lowPrice, marketPrice, etc
          // pricing.tcgplayer.holo.marketPrice, etc
          //
          // We skip "normal" on purpose.
          const variantEntries = Object.entries(pricing)
            .filter(([k, v]) => typeof v === "object" && v !== null);

          let didAny = false;

          for (const [k, v] of variantEntries) {
            const variantType = mapKeyToVariantType(k);
            if (!variantType) continue;

            const low = numOrNull(v.lowPrice ?? v.low ?? null);
            const mid = numOrNull(v.midPrice ?? v.mid ?? null);
            const high = numOrNull(v.highPrice ?? v.high ?? null);
            const market = numOrNull(v.marketPrice ?? v.market ?? null);

            // If it's all nulls, don't spam the table
            if (low == null && mid == null && high == null && market == null) continue;

            // Upsert
            await client.query(
              `
              INSERT INTO public.tcg_card_prices_tcgplayer (
                card_id,
                variant_type,
                updated_at,
                currency,
                low_price,
                mid_price,
                high_price,
                market_price
              )
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
              ON CONFLICT (card_id, variant_type)
              DO UPDATE SET
                updated_at   = EXCLUDED.updated_at,
                currency     = EXCLUDED.currency,
                low_price    = EXCLUDED.low_price,
                mid_price    = EXCLUDED.mid_price,
                high_price   = EXCLUDED.high_price,
                market_price = EXCLUDED.market_price
            `,
              [cardId, variantType, updated, unit, low, mid, high, market],
            );

            upserts++;
            didAny = true;
          }

          if (!didAny) skippedNoPricing++;
          processed++;

          // tiny pacing to reduce 429s
          if (processed % 50 === 0) await sleep(100);
        } catch (e) {
          errors++;
          processed++;
          if (errors < 25) {
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

  await client.end();
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
