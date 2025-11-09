// Run:
//   YGO_REWRITE_MODE=truncate DATABASE_URL='postgresql://.../neondb?...' node scripts/syncYgoFromYGOPRODeck.mjs
// or
//   YGO_REWRITE_MODE=per-card DATABASE_URL='postgresql://.../neondb?...' node scripts/syncYgoFromYGOPRODeck.mjs

import pg from "pg";
const { Pool } = pg;

// ----- env -----
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL env");
  process.exit(1);
}
const MODE = (process.env.YGO_REWRITE_MODE || "per-card").toLowerCase();
if (!["truncate", "per-card"].includes(MODE)) {
  console.error("YGO_REWRITE_MODE must be 'truncate' or 'per-card'");
  process.exit(1);
}
console.log(`Mode: ${MODE}`);

const pool = new Pool({ connectionString: DATABASE_URL, max: 4 });

// ----- API -----
const API_CARDS = "https://db.ygoprodeck.com/api/v7/cardinfo.php";
const FETCH_OPTS = { headers: { "User-Agent": "Legendary-Collectibles/ygopull" } };

// ----- helpers -----
const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// ----- SQL (pure inserts; conflicts ignored for child tables as a guard) -----
const insertCardSQL = `
INSERT INTO ygo_cards
  (card_id, name, type, "desc", atk, def, level, race, attribute, archetype, ygoprodeck_url, linkval, scale, linkmarkers, updated_at)
VALUES
  ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
`;

const insertPriceSQL = `
INSERT INTO ygo_card_prices
  (card_id, tcgplayer_price, cardmarket_price, ebay_price, amazon_price, coolstuffinc_price)
VALUES
  ($1,$2,$3,$4,$5,$6)
`;

const insertBanSQL = `
INSERT INTO ygo_card_banlist
  (card_id, ban_tcg, ban_ocg, ban_goat)
VALUES
  ($1,$2,$3,$4)
`;

// NOTE: ON CONFLICT guards prevent accidental dupes from crashing the batch.
const insertImageSQL = `
INSERT INTO ygo_card_images (card_id, image_url_small, image_url)
VALUES ($1,$2,$3)
ON CONFLICT DO NOTHING
`;

const insertSetSQL = `
INSERT INTO ygo_card_sets (card_id, set_name, set_code, set_rarity, set_price)
VALUES ($1,$2,$3,$4,$5)
ON CONFLICT (card_id, set_code) DO NOTHING
`;

// Per-card delete
async function deleteCardEverywhere(client, cardId) {
  await client.query(`DELETE FROM ygo_card_images  WHERE card_id = $1`, [cardId]);
  await client.query(`DELETE FROM ygo_card_prices  WHERE card_id = $1`, [cardId]);
  await client.query(`DELETE FROM ygo_card_banlist WHERE card_id = $1`, [cardId]);
  await client.query(`DELETE FROM ygo_card_sets    WHERE card_id = $1`, [cardId]);
  await client.query(`DELETE FROM ygo_cards        WHERE card_id = $1`, [cardId]);
}

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

  if (MODE === "truncate") {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`
        TRUNCATE TABLE
          ygo_card_images,
          ygo_card_prices,
          ygo_card_banlist,
          ygo_card_sets,
          ygo_cards
        RESTART IDENTITY CASCADE
      `);
      await client.query("COMMIT");
      console.log("Truncated all YGO tables.");
    } catch (err) {
      try { await client.query("ROLLBACK"); } catch {}
      client.release();
      console.error("Truncate failed:", err);
      process.exit(1);
    }
    client.release();
  }

  let processed = 0;
  for (const batch of chunk(cards, 400)) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      for (const c of batch) {
        const cardId = String(c.id);
        const linkmarkers = Array.isArray(c.linkmarkers) ? c.linkmarkers : null;

        if (MODE === "per-card") {
          await deleteCardEverywhere(client, cardId);
        }

        // 1) card
        await client.query(insertCardSQL, [
          cardId,
          c.name ?? null,
          c.type ?? null,
          c.desc ?? null,
          Number.isFinite(c.atk) ? c.atk : null,
          Number.isFinite(c.def) ? c.def : null,
          Number.isFinite(c.level) ? c.level : null,
          c.race ?? null,
          c.attribute ?? null,
          c.archetype ?? null,
          `https://db.ygoprodeck.com/card/?search=${encodeURIComponent(c.name ?? cardId)}`,
          Number.isFinite(c.linkval) ? c.linkval : null,
          Number.isFinite(c.scale) ? c.scale : null,
          linkmarkers,
        ]);

        // 2) images — de-dupe by URL pair
        const imgs = Array.isArray(c.card_images) ? c.card_images : [];
        const seenImg = new Set();
        for (const img of imgs) {
          const small = img.image_url_small ?? "";
          const large = img.image_url ?? "";
          const key = `${small}::${large}`;
          if (seenImg.has(key)) continue;
          seenImg.add(key);
          if (!small && !large) continue;
          await client.query(insertImageSQL, [cardId, small || null, large || null]);
        }

        // 3) prices — use first price object if present
        const price = Array.isArray(c.card_prices) && c.card_prices[0] ? c.card_prices[0] : null;
        if (price) {
          await client.query(insertPriceSQL, [
            cardId,
            price.tcgplayer_price != null ? Number(price.tcgplayer_price) : null,
            price.cardmarket_price != null ? Number(price.cardmarket_price) : null,
            price.ebay_price != null ? Number(price.ebay_price) : null,
            price.amazon_price != null ? Number(price.amazon_price) : null,
            price.coolstuffinc_price != null ? Number(price.coolstuffinc_price) : null,
          ]);
        }

        // 4) banlist
        const ban = c.banlist_info || null;
        if (ban) {
          await client.query(insertBanSQL, [
            cardId,
            ban?.ban_tcg ?? null,
            ban?.ban_ocg ?? null,
            ban?.ban_goat ?? null,
          ]);
        }

        // 5) sets — de-dupe by set_code; skip blank codes; conflict-safe insert
        const sets = Array.isArray(c.card_sets) ? c.card_sets : [];
        const seenCodes = new Set();
        for (const s of sets) {
          const code = (s.set_code ?? "").trim();
          if (!code) continue;           // PK includes set_code -> must not be NULL/blank
          if (seenCodes.has(code)) continue;
          seenCodes.add(code);

          await client.query(insertSetSQL, [
            cardId,
            s.set_name ?? null,
            code,
            s.set_rarity ?? null,
            s.set_price != null && s.set_price !== "" ? String(s.set_price) : null,
          ]);
        }
      }

      await client.query("COMMIT");
      client.release();
      processed += batch.length;
      console.log(`Committed ${batch.length} cards (total ${processed}/${cards.length})`);
    } catch (err) {
      try { await pool.query("ROLLBACK"); } catch {}
      client.release();
      console.error("Batch failed:", err);
      process.exit(1);
    }
  }

  console.log("All done.");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
