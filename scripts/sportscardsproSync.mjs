#!/usr/bin/env node
/**
 * SportsCardsPro Sync (data-only)
 * - Crawls set index pages for Baseball/Basketball/Football
 * - Scrapes set pages for card list items
 * - Resolves exact products via official API (/api/products -> /api/product)
 * - Upserts mapping + current prices (in cents)
 *
 * ENV:
 *   DATABASE_URL=postgres://user:pass@host/db
 *   SC_PRO_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 */

import * as dotenv from "dotenv";
dotenv.config();

import pg from "pg";
const { Client } = pg;

// ---------- config ----------
const TOKEN = process.env.SC_PRO_TOKEN;
if (!TOKEN) {
  console.error("Missing SC_PRO_TOKEN in environment.");
  process.exit(1);
}

const SPORTS = [
  { sport: "football",  catUrl: "https://www.sportscardspro.com/category/football-cards",  consolePrefix: "Football Cards"  },
  { sport: "basketball",catUrl: "https://www.sportscardspro.com/category/basketball-cards",consolePrefix: "Basketball Cards"},
  { sport: "baseball",  catUrl: "https://www.sportscardspro.com/category/baseball-cards",  consolePrefix: "Baseball Cards"  },
];

const CONCURRENCY = 6;     // network pool
const SET_FETCH_DELAY = 150;   // ms between requests (be polite)
const CARD_FETCH_DELAY = 120;  // ms between requests

// ---------- tiny helpers ----------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function slug(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

import crypto from "node:crypto";
function canonKey({ sport, year, setName, number, player }) {
  return [sport, year || "", (setName || "").trim(), (number || "").trim(), (player || "").trim()]
    .map((s) => (s + "").toLowerCase().replace(/\s+/g, " ").trim())
    .join("|");
}
function idFromKey(k) { return crypto.createHash("md5").update(k).digest("hex"); }

async function fetchText(url, { retries = 4, timeoutMs = 15000 } = {}) {
  for (let i = 0; i <= retries; i++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ac.signal, redirect: "follow" });
      clearTimeout(t);
      if (res.ok) return await res.text();
      if (res.status >= 500 && i < retries) { await sleep(300 * (i + 1)); continue; }
      throw new Error(`${res.status} ${res.statusText}`);
    } catch (e) {
      clearTimeout(t);
      if (i === retries) throw e;
      await sleep(300 * (i + 1));
    }
  }
  throw new Error("unreachable");
}

async function fetchJSON(url, { retries = 4, timeoutMs = 15000 } = {}) {
  for (let i = 0; i <= retries; i++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ac.signal, redirect: "follow", headers: { accept: "application/json" } });
      clearTimeout(t);
      if (res.ok) return await res.json();
      // Do NOT retry 4xx from API
      if (res.status >= 500 && i < retries) { await sleep(300 * (i + 1)); continue; }
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText} ${text.slice(0,140)}`);
    } catch (e) {
      clearTimeout(t);
      if (i === retries) throw e;
      await sleep(300 * (i + 1));
    }
  }
  throw new Error("unreachable");
}

// crude HTML scraping w/o deps
function extractLinks(html, hrefIncludes) {
  const out = [];
  const rx = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = rx.exec(html))) {
    const href = m[1];
    const txt  = m[2].replace(/<[^>]+>/g, "").trim();
    if (href.includes(hrefIncludes)) out.push({ href, text: txt });
  }
  return out;
}

function textBetween(h, startMarker, endMarker) {
  const i = h.indexOf(startMarker);
  if (i === -1) return "";
  const j = h.indexOf(endMarker, i + startMarker.length);
  if (j === -1) return "";
  return h.slice(i + startMarker.length, j);
}

function parseSetTitle(html) {
  // Set pages show: "#  Prices for 2024 Panini Prizm Football Cards"
  // We want "2024 Panini Prizm" and the year if present
  const h1Match = html.match(/Prices for ([^<]+?) (Football|Basketball|Baseball) Cards/i);
  if (!h1Match) return { title: null, year: null, setCore: null };
  const core = h1Match[1].trim(); // e.g., "2024 Panini Prizm"
  const yearMatch = core.match(/\b(19|20)\d{2}\b/);
  return { title: core, year: yearMatch ? parseInt(yearMatch[0], 10) : null, setCore: core };
}

function expectedConsoleName(consolePrefix, setCore) {
  // Docs show format like "Football Cards 2024 Panini Prizm"
  return `${consolePrefix} ${setCore}`.trim();
}

// Best-effort pick from API /api/products results
function pickBestProduct(products, { consoleName, numberFragment, nameFragment }) {
  if (!products?.length) return null;

  // 1) exact console-name match
  let candidates = products.filter(p =>
    (p["console-name"] || "").toLowerCase() === (consoleName || "").toLowerCase()
  );

  // 2) fallback: loose console contains setCore
  if (!candidates.length && consoleName) {
    const core = consoleName.replace(/^(Football|Basketball|Baseball)\s+Cards\s+/i, "");
    candidates = products.filter(p =>
      (p["console-name"] || "").toLowerCase().includes(core.toLowerCase())
    );
  }

  const list = candidates.length ? candidates : products;

  // bias for number fragment like "#347"
  const withNumber = numberFragment
    ? list.filter(p => (p["product-name"] || "").includes(numberFragment))
    : list;

  // bias for name fragment
  const withName = nameFragment
    ? withNumber.filter(p => (p["product-name"] || "").toLowerCase().includes(nameFragment.toLowerCase()))
    : withNumber;

  return withName[0] || list[0] || products[0] || null;
}

// ---------- DB bootstrap / upserts ----------
async function ensureTables(client) {
  await client.query(`
CREATE TABLE IF NOT EXISTS sc_sets(
  id text PRIMARY KEY,
  sport text NOT NULL,
  year int,
  name text NOT NULL,
  source text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS sc_cards(
  id text PRIMARY KEY,
  sport text NOT NULL,
  year int,
  set_name text,
  number text,
  player text,
  team text,
  canonical_key text NOT NULL,
  source text NOT NULL,
  source_url text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS sc_cards_canonical_idx ON sc_cards(canonical_key);
`);
  // vendor tables
  await client.query(`
CREATE TABLE IF NOT EXISTS scp_products(
  scp_id        text PRIMARY KEY,
  card_id       text NOT NULL REFERENCES sc_cards(id) ON DELETE CASCADE,
  console_name  text NOT NULL,
  product_name  text NOT NULL,
  release_date  date,
  sales_volume  integer,
  last_seen     timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS scp_products_card_idx ON scp_products(card_id);
CREATE INDEX IF NOT EXISTS scp_products_console_idx ON scp_products(console_name);

CREATE TABLE IF NOT EXISTS scp_prices(
  scp_id              text PRIMARY KEY REFERENCES scp_products(scp_id) ON DELETE CASCADE,
  loose_price         integer,
  graded_price        integer,
  new_price           integer,
  cib_price           integer,
  condition_17_price  integer,
  condition_18_price  integer,
  bgs_10_price        integer,
  manual_only_price   integer,
  retail_loose_buy    integer,
  retail_loose_sell   integer,
  retail_new_buy      integer,
  retail_new_sell     integer,
  retail_cib_buy      integer,
  retail_cib_sell     integer,
  updated_at          timestamptz DEFAULT now() NOT NULL
);
`);
}

async function upsertSet(client, { sport, year, name }) {
  const id = slug([sport, year, name].filter(Boolean).join("-"));
  await client.query(
    `INSERT INTO sc_sets (id, sport, year, name, source)
     VALUES ($1,$2,$3,$4,'sportscardspro')
     ON CONFLICT (id) DO UPDATE SET sport=EXCLUDED.sport, year=EXCLUDED.year, name=EXCLUDED.name, updated_at=now()`,
    [id, sport, year || null, name]
  );
  return id;
}

async function upsertCard(client, card) {
  const k = canonKey(card);
  const id = idFromKey(k);
  await client.query(
    `INSERT INTO sc_cards (id, sport, year, set_name, number, player, team, canonical_key, source, source_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'sportscardspro',$9)
     ON CONFLICT (id) DO UPDATE SET
       sport=EXCLUDED.sport, year=EXCLUDED.year, set_name=EXCLUDED.set_name, number=EXCLUDED.number,
       player=EXCLUDED.player, team=EXCLUDED.team, canonical_key=EXCLUDED.canonical_key,
       source_url=EXCLUDED.source_url, updated_at=now()`,
    [id, card.sport, card.year || null, card.setName || null, card.number || null, card.player || null, card.team || null, k, card.sourceUrl || null]
  );
  return id;
}

async function upsertScpProduct(client, data) {
  const {
    scpId, cardId, consoleName, productName,
    releaseDate, salesVolume
  } = data;

  await client.query(
    `INSERT INTO scp_products (scp_id, card_id, console_name, product_name, release_date, sales_volume, last_seen)
     VALUES ($1,$2,$3,$4,$5,$6,now())
     ON CONFLICT (scp_id) DO UPDATE SET
       card_id=EXCLUDED.card_id,
       console_name=EXCLUDED.console_name,
       product_name=EXCLUDED.product_name,
       release_date=EXCLUDED.release_date,
       sales_volume=EXCLUDED.sales_volume,
       last_seen=now()`,
    [scpId, cardId, consoleName, productName, releaseDate, salesVolume || null]
  );
}

async function upsertScpPrices(client, scpId, j) {
  // Keys per docs (all pennies). Missing = null.
  const row = {
    loose_price:        j["loose-price"] ?? null,
    graded_price:       j["graded-price"] ?? null,
    new_price:          j["new-price"] ?? null,
    cib_price:          j["cib-price"] ?? null,
    condition_17_price: j["condition-17-price"] ?? null,
    condition_18_price: j["condition-18-price"] ?? null,
    bgs_10_price:       j["bgs-10-price"] ?? null,
    manual_only_price:  j["manual-only-price"] ?? null,
    retail_loose_buy:   j["retail-loose-buy"] ?? null,
    retail_loose_sell:  j["retail-loose-sell"] ?? null,
    retail_new_buy:     j["retail-new-buy"] ?? null,
    retail_new_sell:    j["retail-new-sell"] ?? null,
    retail_cib_buy:     j["retail-cib-buy"] ?? null,
    retail_cib_sell:    j["retail-cib-sell"] ?? null,
  };

  await client.query(
    `INSERT INTO scp_prices (
       scp_id, loose_price, graded_price, new_price, cib_price,
       condition_17_price, condition_18_price, bgs_10_price, manual_only_price,
       retail_loose_buy, retail_loose_sell, retail_new_buy, retail_new_sell,
       retail_cib_buy, retail_cib_sell, updated_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now()
     )
     ON CONFLICT (scp_id) DO UPDATE SET
       loose_price=EXCLUDED.loose_price,
       graded_price=EXCLUDED.graded_price,
       new_price=EXCLUDED.new_price,
       cib_price=EXCLUDED.cib_price,
       condition_17_price=EXCLUDED.condition_17_price,
       condition_18_price=EXCLUDED.condition_18_price,
       bgs_10_price=EXCLUDED.bgs_10_price,
       manual_only_price=EXCLUDED.manual_only_price,
       retail_loose_buy=EXCLUDED.retail_loose_buy,
       retail_loose_sell=EXCLUDED.retail_loose_sell,
       retail_new_buy=EXCLUDED.retail_new_buy,
       retail_new_sell=EXCLUDED.retail_new_sell,
       retail_cib_buy=EXCLUDED.retail_cib_buy,
       retail_cib_sell=EXCLUDED.retail_cib_sell,
       updated_at=now()`,
    [
      scpId,
      row.loose_price, row.graded_price, row.new_price, row.cib_price,
      row.condition_17_price, row.condition_18_price, row.bgs_10_price, row.manual_only_price,
      row.retail_loose_buy, row.retail_loose_sell, row.retail_new_buy, row.retail_new_sell,
      row.retail_cib_buy, row.retail_cib_sell
    ]
  );
}

// ---------- scraping flow ----------
async function listSetPagesForSport(sportCfg) {
  // The category page contains many set links to /console/<sport-cards-...>
  const html = await fetchText(sportCfg.catUrl);
  const links = extractLinks(html, "/console/");
  // Deduplicate + normalize
  const seen = new Set();
  const out = [];
  for (const l of links) {
    const href = new URL(l.href, "https://www.sportscardspro.com").toString();
    if (seen.has(href)) continue;
    seen.add(href);
    out.push({ href, text: l.text });
  }
  return out;
}

function parseCardLine(text) {
  // Examples: "Jayden Daniels [Silver] #347", "Caleb Williams #301 [RC]", "Ricky Pearsall [Choice Nebula] #383 /1"
  const num = (text.match(/#\s*([A-Za-z0-9\-\/]+)/) || [])[1] || null;
  // crude name extraction = text before " #"
  const namePart = text.split(/#\s*[A-Za-z0-9\-\/]+/)[0].trim();
  // prefer leading words until bracket as player chunk
  const player = namePart.replace(/\s*\[[^\]]+\]\s*/g, "").trim();
  return { number: num, player, raw: text };
}

function buildQuery(cardText, setCore) {
  // Just throw the full card text + set into q so API can fuzzy match well
  // e.g., "Jayden Daniels [Silver] #347 2024 Panini Prizm"
  return `${cardText} ${setCore}`.replace(/\s+/g, " ").trim();
}

async function processSetPage(client, sportCfg, setUrl) {
  const html = await fetchText(setUrl);
  const { setCore, year } = parseSetTitle(html);  // "2024 Panini Prizm"
  if (!setCore) return { cards: 0, prices: 0 };

  const setName = setCore;
  const setId = await upsertSet(client, { sport: sportCfg.sport, year, name: setName });
  // card links show as /game/... — grab all
  const cardsSection = textBetween(html, "## SportsCardsPro Index", "</main>") || html;
  const cardLinks = extractLinks(cardsSection, "/game/");
  // Some pages lazy load more; we still take what’s available server-side
  let addedCards = 0, updatedPrices = 0;

  // Process with a small pool
  const pool = [];
  let idx = 0;

  async function worker() {
    while (idx < cardLinks.length) {
      const me = idx++;
      const { text: cardText } = cardLinks[me];
      if (!cardText || cardText.length < 2) continue;

      const { number, player } = parseCardLine(cardText);
      const query = buildQuery(cardText, setCore);
      const consoleName = expectedConsoleName(sportCfg.consolePrefix, setCore);
      await sleep(CARD_FETCH_DELAY);

      // Search products (first 20)
      const searchUrl = `https://www.sportscardspro.com/api/products?t=${TOKEN}&q=${encodeURIComponent(query)}`;
      let sj;
      try {
        sj = await fetchJSON(searchUrl, { retries: 2, timeoutMs: 12000 });
      } catch (e) {
        // keep going
        continue;
      }
      if (sj?.status !== "success" || !Array.isArray(sj.products)) continue;

      const numberFragment = number ? `#${number}` : null;
      const best = pickBestProduct(sj.products, {
        consoleName,
        numberFragment,
        nameFragment: player || null
      });
      if (!best?.id) continue;

      // Fetch single product for prices
      const prodUrl = `https://www.sportscardspro.com/api/product?t=${TOKEN}&id=${best.id}`;
      let pj;
      try {
        pj = await fetchJSON(prodUrl, { retries: 1, timeoutMs: 12000 });
      } catch {
        continue;
      }
      if (pj?.status !== "success") continue;

      // Derive card row & upsert generic catalog
      const cardRow = {
        sport: sportCfg.sport,
        year: year || null,
        setName,
        number: number || null,
        player: player || null,
        team: null,
        sourceUrl: setUrl,
      };
      const cardId = await upsertCard(client, cardRow);
      addedCards++;

      // Vendor map + prices
      const releaseDate = pj["release-date"] ? new Date(pj["release-date"]) : null;
      const salesVolume = pj["sales-volume"] ?? null;

      await upsertScpProduct(client, {
        scpId: String(pj.id),
        cardId,
        consoleName: pj["console-name"] || best["console-name"] || consoleName,
        productName: pj["product-name"] || best["product-name"] || cardText,
        releaseDate,
        salesVolume
      });

      await upsertScpPrices(client, String(pj.id), pj);
      updatedPrices++;
    }
  }

  for (let i = 0; i < Math.min(CONCURRENCY, Math.max(1, cardLinks.length)); i++) {
    pool.push(worker());
  }
  await Promise.all(pool);

  return { cards: addedCards, prices: updatedPrices };
}

// ---------- runner ----------
process.on("unhandledRejection", e => console.warn("unhandledRejection:", e?.message || e));
process.on("uncaughtException",  e => console.warn("uncaughtException:",  e?.message || e));

(async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await ensureTables(client);

  let totalSets = 0, totalCards = 0, totalPrices = 0;

  for (const sportCfg of SPORTS) {
    const sets = await listSetPagesForSport(sportCfg);   // /console/... pages
    // process sets with a pool
    let i = 0;
    async function setWorker() {
      while (i < sets.length) {
        const me = i++;
        const u = sets[me].href;
        try {
          const { cards, prices } = await processSetPage(client, sportCfg, u);
          totalCards += cards;
          totalPrices += prices;
          totalSets++;
          await sleep(SET_FETCH_DELAY);
        } catch (e) {
          // keep going
        }
      }
    }
    const workers = Array.from({ length: CONCURRENCY }, () => setWorker());
    await Promise.all(workers);
  }

  console.log(`SportsCardsPro sync complete.
Processed sets: ${totalSets}
Cards upserted: ${totalCards}
Price rows upserted: ${totalPrices}`);
  await client.end();
})().catch(e => {
  console.error("Fatal:", e?.stack || e);
  process.exit(1);
});
