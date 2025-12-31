#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * scripts/tcgdex_jp_sync.mjs
 *
 * Sync Japanese Pokémon cards from TCGdex into:
 * - tcg_cards (summary fields)
 * - tcgdex_raw (full payload)
 * - tcg_price_history (best-effort if pricing exists)
 *
 * Stores usable image URLs:
 *   <base>/low.webp and <base>/high.webp
 *
 * Env:
 *   DATABASE_URL (required)
 *
 * Usage:
 *   node scripts/tcgdex_jp_sync.mjs
 *   node scripts/tcgdex_jp_sync.mjs --limitSets 5
 */

import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const BASE = "https://api.tcgdex.net/v2";
const LANG = "ja";
const SOURCE = "tcgdex";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url, { retries = 4, backoffMs = 750 } = {}) {
  let lastErr = null;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          "user-agent": "legendary-collectibles/1.0 (tcgdex jp sync)",
          accept: "application/json",
        },
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.statusText} :: ${url} :: ${text.slice(0, 200)}`);
      }
      return await res.json();
    } catch (e) {
      lastErr = e;
      const wait = backoffMs * Math.pow(2, i);
      await sleep(wait);
    }
  }
  throw lastErr;
}

const setKey = (setId) => `${SOURCE}:${LANG}:${setId}`;
const cardKey = (cardId) => `${SOURCE}:${LANG}:${cardId}`;

function toIsoDate(d) {
  if (!d) return null;
  return String(d);
}

function parseVariants(card) {
  const v = card?.variants || {};
  return {
    normal: !!v.normal,
    reverse: !!v.reverse,
    holo: !!v.holo,
    firstEdition: !!v.firstEdition,
  };
}

function tcgdexAsset(urlBase, quality /* "low"|"high" */) {
  if (!urlBase) return null;

  // Accept any assets.tcgdex.net base, regardless of path casing
  const isTcgdex = typeof urlBase === "string" && urlBase.includes("assets.tcgdex.net/");
  if (!isTcgdex) return urlBase;

  // If already a concrete file URL, keep it
  if (/\/(low|high)\.(webp|png|jpg)$/i.test(urlBase)) return urlBase;

  // If it ends with an extension, keep it
  if (/\.(webp|png|jpg)$/i.test(urlBase)) return urlBase;

  return `${urlBase}/${quality}.webp`;
}


async function upsertCard(client, cardDetail, { briefImageBase = null } = {}) {
  const pk = cardKey(cardDetail.id);

  const setId = cardDetail?.set?.id ?? null;
  const set_id = setId ? setKey(setId) : null;

  const set_name = cardDetail?.set?.name ?? null;
  const series = cardDetail?.set?.serie?.name ?? null;
  const release_date = toIsoDate(cardDetail?.set?.releaseDate ?? null);

  const symbol_url = cardDetail?.set?.symbol ?? null;
  const logo_url = cardDetail?.set?.logo ?? null;

  // Card images: prefer detail.image; fallback to set list brief.image
  const imageBase = cardDetail?.image ?? briefImageBase ?? null;
  const small_image = tcgdexAsset(imageBase, "low");
  const large_image = tcgdexAsset(imageBase, "high");

  const number = cardDetail?.localId != null ? String(cardDetail.localId) : null;
  const rarity = cardDetail?.rarity ?? null;
  const artist = cardDetail?.illustrator ?? null;

  const regulation_mark = cardDetail?.regulationMark ?? null;

  const { normal, reverse, holo, firstEdition } = parseVariants(cardDetail);

  const extra = {
    tcgdex_meta: {
      id: cardDetail?.id ?? null,
      setId: cardDetail?.set?.id ?? null,
      updated: cardDetail?.updated ?? null,
      imageBase,
    },
    syncedAt: new Date().toISOString(),
  };

  await client.query(
    `
    INSERT INTO tcg_cards (
      id,
      name,
      set_id,
      set_name,
      series,
      release_date,
      symbol_url,
      logo_url,
      small_image,
      large_image,
      number,
      rarity,
      artist,
      regulation_mark,
      variant_normal,
      variant_reverse,
      variant_holo,
      variant_first_edition,
      source,
      lang,
      source_id,
      extra
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
      $11,$12,$13,$14,$15,$16,$17,$18,
      $19,$20,$21,$22
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      set_id = EXCLUDED.set_id,
      set_name = EXCLUDED.set_name,
      series = EXCLUDED.series,
      release_date = EXCLUDED.release_date,
      symbol_url = EXCLUDED.symbol_url,
      logo_url = EXCLUDED.logo_url,
      small_image = EXCLUDED.small_image,
      large_image = EXCLUDED.large_image,
      number = EXCLUDED.number,
      rarity = EXCLUDED.rarity,
      artist = EXCLUDED.artist,
      regulation_mark = EXCLUDED.regulation_mark,
      variant_normal = EXCLUDED.variant_normal,
      variant_reverse = EXCLUDED.variant_reverse,
      variant_holo = EXCLUDED.variant_holo,
      variant_first_edition = EXCLUDED.variant_first_edition,
      source = EXCLUDED.source,
      lang = EXCLUDED.lang,
      source_id = EXCLUDED.source_id,
      extra = EXCLUDED.extra
    `,
    [
      pk,
      cardDetail?.name ?? null,
      set_id,
      set_name,
      series,
      release_date,
      symbol_url,
      logo_url,
      small_image,
      large_image,
      number,
      rarity,
      artist,
      regulation_mark,
      normal,
      reverse,
      holo,
      firstEdition,
      SOURCE,
      LANG,
      cardDetail.id,
      extra,
    ]
  );

  return pk;
}

async function upsertRaw(client, { sourceCardId, cardPk, setSourceId, payload }) {
  await client.query(
    `
    INSERT INTO tcgdex_raw (
      source, lang, source_card_id, card_pk, set_source_id, payload, fetched_at
    )
    VALUES ($1,$2,$3,$4,$5,$6, now())
    ON CONFLICT (source, lang, source_card_id) DO UPDATE SET
      card_pk = EXCLUDED.card_pk,
      set_source_id = EXCLUDED.set_source_id,
      payload = EXCLUDED.payload,
      fetched_at = now()
    `,
    [SOURCE, LANG, sourceCardId, cardPk, setSourceId, payload]
  );
}

function extractTcgdexPrices(card) {
  const p = card?.pricing ?? card?.price ?? card?.prices ?? null;
  if (!p) return [];

  if (typeof p === "object" && p !== null && !Array.isArray(p)) {
    const keys = Object.keys(p);
    const looksVariantKeyed = keys.some((k) => {
      const v = p[k];
      return v && typeof v === "object" && !Array.isArray(v);
    });

    if (looksVariantKeyed) {
      return keys.map((variantKey) => ({ variantKey, data: p[variantKey] }));
    }
    return [{ variantKey: null, data: p }];
  }

  if (Array.isArray(p)) {
    return p.map((x, i) => ({ variantKey: String(i), data: x }));
  }

  return [];
}

function pickNum(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function insertPriceSnapshots(client, { cardPk, card, sourceUrl }) {
  const snaps = extractTcgdexPrices(card);
  if (!snaps.length) return 0;

  let inserted = 0;
  for (const s of snaps) {
    const data = s?.data || {};
    const currency = data.currency || data.cur || "USD";

    await client.query(
      `
      INSERT INTO tcg_price_history (
        game, source, lang, card_id, variant_key, currency,
        price_low, price_mid, price_high, price_market,
        source_url, source_updated_at, payload
      )
      VALUES (
        'pokemon', $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12
      )
      `,
      [
        SOURCE,
        LANG,
        cardPk,
        s.variantKey,
        currency,
        pickNum(data.low ?? data.min ?? data.lowest ?? data.lowPrice),
        pickNum(data.mid ?? data.median ?? data.avg ?? data.average ?? data.midPrice),
        pickNum(data.high ?? data.max ?? data.highest ?? data.highPrice),
        pickNum(data.market ?? data.marketPrice ?? data.price),
        sourceUrl ?? null,
        data.updatedAt ? new Date(data.updatedAt) : null,
        { tcgdexPricing: data },
      ]
    );

    inserted++;
  }

  return inserted;
}

async function main() {
  const limitSets = Number(argValue("--limitSets", "0")) || 0;

  const client = await pool.connect();
  try {
    console.log("=== TCGdex JP sync: start ===");

    const setBriefs = await fetchJson(`${BASE}/${LANG}/sets`);
    if (!Array.isArray(setBriefs)) throw new Error("Unexpected sets response (expected array)");

    const sets = limitSets > 0 ? setBriefs.slice(0, limitSets) : setBriefs;
    console.log(`Sets total=${setBriefs.length} processing=${sets.length}`);

    let cardsOk = 0;
    let rawOk = 0;
    let priceRows = 0;
    let cardsWithImageBase = 0;

    for (const s of sets) {
      const setId = s?.id;
      if (!setId) continue;

      const setDetail = await fetchJson(`${BASE}/${LANG}/sets/${encodeURIComponent(setId)}`);
      const cards = Array.isArray(setDetail.cards) ? setDetail.cards : [];
      console.log(`- ${setId} ${setDetail.name} cards=${cards.length}`);

      await client.query("BEGIN");

      for (const c of cards) {
        const cardId = c?.id;
        if (!cardId) continue;

        const briefImageBase = c?.image ?? null;

        const cardDetailUrl = `${BASE}/${LANG}/cards/${encodeURIComponent(cardId)}`;
        const cardDetail = await fetchJson(cardDetailUrl);

        const pk = await upsertCard(client, cardDetail, { briefImageBase });
        cardsOk++;

        const setSourceId = cardDetail?.set?.id ?? setId ?? null;
        await upsertRaw(client, {
          sourceCardId: cardDetail.id,
          cardPk: pk,
          setSourceId,
          payload: cardDetail,
        });
        rawOk++;

        priceRows += await insertPriceSnapshots(client, {
          cardPk: pk,
          card: cardDetail,
          sourceUrl: cardDetailUrl,
        });

        const imageBase = cardDetail?.image ?? briefImageBase ?? null;
        if (imageBase) cardsWithImageBase++;

        await sleep(60);
      }

      await client.query("COMMIT");
      await sleep(200);
    }

    console.log(
      `=== done cards=${cardsOk} raw_upserts=${rawOk} price_rows=${priceRows} cards_with_image_base=${cardsWithImageBase} ===`
    );
  } catch (e) {
    console.error("SYNC FAILED:", e);
    try {
      await pool.query("ROLLBACK");
    } catch {}
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
