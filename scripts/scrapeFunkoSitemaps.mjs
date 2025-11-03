// scripts/scrapeFunkoSitemaps.mjs
import fs from "node:fs/promises";

// ── Config via env ─────────────────────────────────────────────────────────────
const HOSTS = (process.env.FUNKO_SITEMAP_HOSTS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);
const CANDIDATE_HOSTS = HOSTS.length ? HOSTS : [
  "funko.com",
  "www.funko.com",
  "shop.funko.com",
  "www.shop.funko.com",
];

const OUT_DIR = process.env.FUNKO_OUT_DIR || "data/funko";
const OUT_PRODUCTS = `${OUT_DIR}/sitemapProductUrls.json`;
const UA =
  process.env.SCRAPE_UA ||
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) LegendaryCollectiblesBot/1.0 Chrome/120 Safari/537.36";

const TIMEOUT_MS = 20000;
const RETRIES = 2;

// ── tiny helpers ───────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchText(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow", signal: ctl.signal });
    if (!res.ok) throw new Error(String(res.status));
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

async function fetchXml(url) {
  for (let i = 0; i <= RETRIES; i++) {
    try {
      return await fetchText(url);
    } catch (e) {
      const msg = (e && e.message) ? e.message : String(e);
      // On 404, don’t retry; just skip
      if (msg.includes("404")) throw Object.assign(new Error(`Failed sitemap fetch 404`), { code: 404 });
      if (i === RETRIES) throw new Error(`Fetch failed after retries: ${msg}`);
      await sleep(500 + 500 * i);
    }
  }
}

function extractLocs(xml) {
  // Light-weight extractor for <loc>…</loc> (works for sitemapindex and urlset)
  const out = [];
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(xml))) out.push(m[1].trim());
  return out;
}

function isSitemapIndex(xml) { return /<\s*sitemapindex[\s>]/i.test(xml); }
function isUrlset(xml)       { return /<\s*urlset[\s>]/i.test(xml); }

function looksLikeProduct(url) {
  // Keep this permissive; we’ll de-dupe
  const u = url.toLowerCase();
  if (!u.startsWith("http")) return false;
  if (!u.includes("funko.com")) return false;
  // Common commerce patterns
  return (
    u.includes("/product") ||
    u.includes("/products/") ||
    u.includes("/shop/") ||
    u.includes("/pop") ||
    u.includes("/item")
  );
}

// ── discovery from robots.txt ──────────────────────────────────────────────────
async function discoverSitemapsFromRobots(host) {
  const url = `https://${host}/robots.txt`;
  try {
    const txt = await fetchText(url);
    const lines = txt.split(/\r?\n/);
    const maps = lines
      .map(l => l.trim())
      .filter(l => /^sitemap:/i.test(l))
      .map(l => l.split(/:\s*/i).slice(1).join(":").trim())
      .filter(Boolean);
    return maps;
  } catch {
    return [];
  }
}

function candidateSitemapPaths(host) {
  // Try a bunch of common locations
  const bases = [
    "/sitemap.xml",
    "/sitemap_index.xml",
    "/sitemaps/sitemap.xml",
    "/sitemaps/sitemap_index.xml",
    "/sitemap-products.xml",
    "/sitemaps/products.xml",
    "/sitemap-products-1.xml",
  ];
  return bases.map(p => `https://${host}${p}`);
}

// ── crawl/collect ──────────────────────────────────────────────────────────────
async function collectFromSitemap(url, visited, acc) {
  if (visited.has(url)) return;
  visited.add(url);

  let xml;
  try {
    xml = await fetchXml(url);
  } catch (e) {
    if (e?.code === 404) {
      console.log(`  • skip 404 ${url}`);
      return;
    }
    console.log(`  • skip ${url} (${e?.message || e})`);
    return;
  }

  if (isSitemapIndex(xml)) {
    const children = extractLocs(xml);
    for (const child of children) {
      await collectFromSitemap(child, visited, acc);
      await sleep(75);
    }
    return;
  }

  if (isUrlset(xml)) {
    const locs = extractLocs(xml);
    for (const link of locs) {
      if (looksLikeProduct(link)) acc.add(link);
    }
    return;
  }

  // Unknown XML type; still try to pick out locs
  for (const link of extractLocs(xml)) {
    if (link.endsWith(".xml")) {
      await collectFromSitemap(link, visited, acc);
    } else if (looksLikeProduct(link)) {
      acc.add(link);
    }
  }
}

async function getAllProductUrlsFromSitemaps() {
  const sitemapCandidates = new Set();

  for (const host of CANDIDATE_HOSTS) {
    const robots = await discoverSitemapsFromRobots(host);
    robots.forEach(u => sitemapCandidates.add(u));
    candidateSitemapPaths(host).forEach(u => sitemapCandidates.add(u));
  }

  console.log(`→ Candidates to try: ${sitemapCandidates.size}`);
  const visited = new Set();
  const products = new Set();

  for (const mapUrl of sitemapCandidates) {
    try {
      await collectFromSitemap(mapUrl, visited, products);
    } catch (e) {
      // already logged in collectFromSitemap
    }
  }

  return [...products];
}

// ── main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log("→ Loading Funko product URLs from sitemap(s) ...");
  const urls = await getAllProductUrlsFromSitemaps();

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(OUT_PRODUCTS, JSON.stringify({ count: urls.length, urls }, null, 2));
  console.log(`✓ Found ${urls.length} product URLs`);
  console.log(`→ Saved: ${OUT_PRODUCTS}`);

  if (urls.length === 0) {
    console.log(
      "⚠ No product URLs found. Funko may not publish sitemaps, or they use non-standard paths.\n" +
      "   You can provide known sitemap URLs via FUNKO_SITEMAP_HOSTS or add a manual seed file."
    );
  }
}

main().catch((e) => {
  console.error("✗ Scrape failed:", e);
  process.exit(1);
});
