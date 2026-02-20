// scripts/ygo/syncYgoFromYGOPRODeck.mjs
/* eslint-disable no-console */
// Node 20+ (global fetch available)
import pg from "pg";
const { Pool } = pg;

// ---------- ENV ----------
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL env");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 4 });

// ---------- API ----------
const API_CARDS = "https://db.ygoprodeck.com/api/v7/cardinfo.php";
const FETCH_OPTS = { headers: { "User-Agent": "Legendary-Collectibles/ygopull" } };

// ---------- HELPERS ----------
const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const toNumOrNull = (v) =>
  Number.isFinite(v) ? v : (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

function norm(v) {
  return String(v ?? "").trim();
}

function asTextOrNull(v) {
  const s = norm(v);
  return s ? s : null;
}

// Best-effort: many YGOPRODeck payloads don't include a canonical updated timestamp for prices.
// If you later discover a reliable field, set it here.
function pickSourceUpdatedAtISO(_card) {
  return null; // keep null unless you have a real upstream timestamp
}

// ---------- SQL (all UPSERTs) ----------
const upsertCardSQL = `
INSERT INTO ygo_cards
  (card_id, name, type, "desc", atk, def, level, race, attribute, archetype, ygoprodeck_url, linkval, scale, linkmarkers, updated_at)
VALUES
  ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
ON CONFLICT (card_id) DO UPDATE SET
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  "desc" = EXCLUDED."desc",
  atk = EXCLUDED.atk,
  def = EXCLUDED.def,
  level = EXCLUDED.level,
  race = EXCLUDED.race,
  attribute = EXCLUDED.attribute,
  archetype = EXCLUDED.archetype,
  ygoprodeck_url = EXCLUDED.ygoprodeck_url,
  linkval = EXCLUDED.linkval,
  scale = EXCLUDED.scale,
  linkmarkers = EXCLUDED.linkmarkers,
  updated_at = now()
`;

const upsertPriceSQL = `
INSERT INTO ygo_card_prices
  (card_id, tcgplayer_price, cardmarket_price, ebay_price, amazon_price, coolstuffinc_price)
VALUES
  ($1,$2,$3,$4,$5,$6)
ON CONFLICT (card_id) DO UPDATE SET
  tcgplayer_price    = EXCLUDED.tcgplayer_price,
  cardmarket_price   = EXCLUDED.cardmarket_price,
  ebay_price         = EXCLUDED.ebay_price,
  amazon_price       = EXCLUDED.amazon_price,
  coolstuffinc_price = EXCLUDED.coolstuffinc_price
`;

/**
 * History insert with de-dupe:
 * Insert a new history row ONLY if it differs from the latest history row for this card_id.
 *
 * captured_at defaults to now() in the table definition.
 */
const insertPriceHistoryDedupSQL = `
WITH last AS (
  SELECT
    tcgplayer_price,
    cardmarket_price,
    ebay_price,
    amazon_price,
    coolstuffinc_price
  FROM public.ygo_card_prices_history
  WHERE card_id = $1
  ORDER BY captured_at DESC
  LIMIT 1
)
INSERT INTO public.ygo_card_prices_history
  (card_id, source_updated_at, tcgplayer_price, cardmarket_price, ebay_price, amazon_price, coolstuffinc_price)
SELECT
  $1,
  $2,
  $3,
  $4,
  $5,
  $6,
  $7
WHERE NOT EXISTS (
  SELECT 1
  FROM last
  WHERE
    COALESCE(last.tcgplayer_price,    -1) = COALESCE($3, -1) AND
    COALESCE(last.cardmarket_price,   -1) = COALESCE($4, -1) AND
    COALESCE(last.ebay_price,         -1) = COALESCE($5, -1) AND
    COALESCE(last.amazon_price,       -1) = COALESCE($6, -1) AND
    COALESCE(last.coolstuffinc_price, -1) = COALESCE($7, -1)
)
`;

const upsertBanSQL = `
INSERT INTO ygo_card_banlist
  (card_id, ban_tcg, ban_ocg, ban_goat)
VALUES
  ($1,$2,$3,$4)
ON CONFLICT (card_id) DO UPDATE SET
  ban_tcg  = EXCLUDED.ban_tcg,
  ban_ocg  = EXCLUDED.ban_ocg,
  ban_goat = EXCLUDED.ban_goat
`;

// ygo_card_sets is expected to have a UNIQUE/PK on (card_id, set_code)
const upsertSetSQL = `
INSERT INTO ygo_card_sets (card_id, set_name, set_code, set_rarity, set_price)
VALUES ($1,$2,$3,$4,$5)
ON CONFLICT (card_id, set_code) DO UPDATE SET
  set_name   = EXCLUDED.set_name,
  set_rarity = EXCLUDED.set_rarity,
  set_price  = EXCLUDED.set_price
`;

/**
 * ygo_card_images likely doesn't have a natural unique key beyond the URLs.
 * Strategy:
 *   1) Try UPDATE by (card_id AND (image_url = $2 OR image_url_small = $3)).
 *   2) If no rows updated, INSERT a new row.
 *
 * Add a UNIQUE constraint later if you want true ON CONFLICT handling, e.g.:
 *   ALTER TABLE ygo_card_images ADD CONSTRAINT ygo_card_images_unique UNIQUE (card_id, image_url);
 */
const updateImageSQL = `
UPDATE ygo_card_images
SET image_url_small = COALESCE($3, image_url_small), image_url = COALESCE($2, image_url)
WHERE card_id = $1 AND (image_url = COALESCE($2,'') OR image_url_small = COALESCE($3,''))
`;
const insertImageSQL = `
INSERT INTO ygo_card_images (card_id, image_url_small, image_url)
VALUES ($1,$3,$2)
`;

// ---------- MAIN ----------
async function main() {
  console.log("Fetching all cards from YGOPRODeck…");
  const res = await fetch(API_CARDS, FETCH_OPTS);
  if (!res.ok) {
    console.error("YGOPRODeck error", res.status, await res.text());
    process.exit(1);
  }

  const payload = await res.json();
  const cards = payload?.data ?? [];
  console.log(`Got ${cards.length} cards`);

  let processed = 0;
  let historyInserts = 0;

  const batches = chunk(cards, 400);
  const t0 = Date.now();

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      for (const c of batch) {
        const cardId = norm(c.id);
        if (!cardId) continue;

        const linkmarkers = Array.isArray(c.linkmarkers) ? c.linkmarkers : null;

        // 1) cards (UPSERT)
        await client.query(upsertCardSQL, [
          cardId,
          asTextOrNull(c.name),
          asTextOrNull(c.type),
          asTextOrNull(c.desc),
          toNumOrNull(c.atk),
          toNumOrNull(c.def),
          toNumOrNull(c.level),
          asTextOrNull(c.race),
          asTextOrNull(c.attribute),
          asTextOrNull(c.archetype),
          `https://db.ygoprodeck.com/card/?search=${encodeURIComponent(c.name ?? cardId)}`,
          toNumOrNull(c.linkval),
          toNumOrNull(c.scale),
          linkmarkers, // expect text[] in schema
        ]);

        // 2) prices (UPSERT + HISTORY SNAPSHOT)
        const price = Array.isArray(c.card_prices) && c.card_prices[0] ? c.card_prices[0] : null;

        if (price) {
          const tcgplayer = toNumOrNull(price.tcgplayer_price);
          const cardmarket = toNumOrNull(price.cardmarket_price);
          const ebay = toNumOrNull(price.ebay_price);
          const amazon = toNumOrNull(price.amazon_price);
          const coolstuffinc = toNumOrNull(price.coolstuffinc_price);

          await client.query(upsertPriceSQL, [
            cardId,
            tcgplayer,
            cardmarket,
            ebay,
            amazon,
            coolstuffinc,
          ]);

          // History: only insert if different from latest snapshot
          const sourceUpdatedAt = pickSourceUpdatedAtISO(c);
          const hist = await client.query(insertPriceHistoryDedupSQL, [
            cardId,
            sourceUpdatedAt, // timestamptz or null
            tcgplayer,
            cardmarket,
            ebay,
            amazon,
            coolstuffinc,
          ]);
          if ((hist?.rowCount ?? 0) > 0) historyInserts += hist.rowCount ?? 0;
        }

        // 3) banlist (UPSERT if present)
        const ban = c.banlist_info || null;
        if (ban) {
          await client.query(upsertBanSQL, [
            cardId,
            asTextOrNull(ban?.ban_tcg),
            asTextOrNull(ban?.ban_ocg),
            asTextOrNull(ban?.ban_goat),
          ]);
        }

        // 4) sets (UPSERT each, de-dupe by set_code)
        const sets = Array.isArray(c.card_sets) ? c.card_sets : [];
        const seenCodes = new Set();
        for (const s of sets) {
          const code = norm(s.set_code);
          if (!code || seenCodes.has(code)) continue;
          seenCodes.add(code);

          await client.query(upsertSetSQL, [
            cardId,
            asTextOrNull(s.set_name),
            code,
            asTextOrNull(s.set_rarity),
            s.set_price != null && s.set_price !== "" ? String(s.set_price) : null,
          ]);
        }

        // 5) images — UPDATE first; if no row changed, INSERT
        const imgs = Array.isArray(c.card_images) ? c.card_images : [];
        const seenImg = new Set();
        for (const img of imgs) {
          const small = norm(img.image_url_small);
          const large = norm(img.image_url);
          const key = `${small}::${large}`;
          if (seenImg.has(key)) continue;
          seenImg.add(key);
          if (!small && !large) continue;

          const upd = await client.query(updateImageSQL, [cardId, large || null, small || null]);
          if ((upd?.rowCount ?? 0) === 0) {
            await client.query(insertImageSQL, [cardId, large || null, small || null]);
          }
        }
      }

      await client.query("COMMIT");
      client.release();

      processed += batch.length;
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(
        `Upserted batch ${bi + 1}/${batches.length} — ${batch.length} cards (total ${processed}/${cards.length}) in ${elapsed}s — history inserts so far: ${historyInserts}`
      );
    } catch (err) {
      try { await client.query("ROLLBACK"); } catch {}
      client.release();
      console.error("Batch failed:", err);
      process.exit(1);
    }
  }

  console.log(`All done. History rows inserted this run: ${historyInserts}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
