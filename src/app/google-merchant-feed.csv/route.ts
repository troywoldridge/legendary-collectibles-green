// src/app/google/merchant-feed/route.ts
import "server-only";

import { Pool } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Use underscore attribute names (Merchant Center references them this way)
const HEADERS = [
  "id",
  "title",
  "description",
  "availability",
  "availability_date",
  "expiration_date",
  "link",
  "mobile_link",
  "image_link",
  "additional_image_link",
  "price",
  "sale_price",
  "sale_price_effective_date",
  "shipping_weight",
  "condition",
  "brand",
  "identifier_exists",
  "gtin",
  "mpn",
  "product_highlight",
  "product_detail",
  "item_group_id",
  "sell_on_google_quantity",
];

const DELIM = "\t";

function moneyUSDFromCents(cents: unknown) {
  const v = Number(cents ?? 0) / 100;
  return `${v.toFixed(2)} USD`;
}

function sanitize(value: unknown) {
  if (value === null || value === undefined) return "";
  let s = String(value);

  // Kill newlines (feeds can choke)
  s = s.replace(/\r\n/g, " ").replace(/\r/g, " ").replace(/\n/g, " ");
  // Remove tabs because TSV delimiter
  s = s.replace(/\t/g, " ");
  // Remove null bytes
  s = s.replace(/\u0000/g, "");
  // Normalize whitespace
  s = s.replace(/\s\s+/g, " ").trim();

  return s;
}

function buildSiteUrl(req: Request) {
  const env =
    process.env.SITE_URL?.replace(/\/+$/, "") ||
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (env) return env;

  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

function buildProductLink(siteUrl: string, slug: unknown) {
  return `${siteUrl}/products/${encodeURIComponent(String(slug || ""))}`;
}

function mapAvailability(status: unknown, qty: unknown) {
  const q = Number(qty ?? 0);
  const s = String(status ?? "").toLowerCase();
  if (s !== "active") return "out_of_stock";
  return q > 0 ? "in_stock" : "out_of_stock";
}

function sellOnGoogleQty(status: unknown, qty: unknown) {
  const s = String(status ?? "").toLowerCase();
  if (s !== "active") return 0;
  const q = Number(qty ?? 0);
  return q > 0 ? q : 0;
}

function mapGoogleCondition(_cond: unknown) {
  // You can refine later (used/new) based on your own condition field.
  return "new";
}

function highlightFromRow(r: any) {
  if (r.is_graded) {
    const g = String(r.grader || "").toUpperCase();
    const grade = r.grade_x10 ? (Number(r.grade_x10) / 10).toFixed(1) : "";
    return `${g ? g + " " : ""}${grade ? "Grade " + grade : "Graded"} collectible`;
  }
  if (r.sealed) return "Factory sealed product";
  if (String(r.format || "").toLowerCase() === "accessory") return "Collector accessory";
  return "Collector-quality single";
}

function detailFromRow(r: any) {
  return r.subtitle || "";
}

function placeholderImageFor(siteUrl: string, r: any) {
  const game = String(r.game || "").toLowerCase();
  if (game === "pokemon") return `${siteUrl}/images/placeholder-pokemon.jpg`;
  if (game === "yugioh") return `${siteUrl}/images/placeholder-yugioh.jpg`;
  if (game === "mtg") return `${siteUrl}/images/placeholder-mtg.jpg`;
  return `${siteUrl}/images/placeholder.jpg`;
}

function safeJsonParse(maybeJson: any) {
  if (!maybeJson) return null;
  if (typeof maybeJson === "object") return maybeJson;
  try {
    return JSON.parse(String(maybeJson));
  } catch {
    return null;
  }
}

function extractScryfallImage(payload: any) {
  const p = safeJsonParse(payload);
  if (!p) return null;

  const iu = p.image_uris;
  // Prefer JPGs for Merchant Center; PNG is also ok, but JPG is safest for "type" issues.
  if (iu?.large) return iu.large;
  if (iu?.normal) return iu.normal;
  if (iu?.small) return iu.small;
  if (iu?.png) return iu.png;

  const faces = Array.isArray(p.card_faces) ? p.card_faces : [];
  for (const f of faces) {
    const fiu = f?.image_uris;
    if (fiu?.large) return fiu.large;
    if (fiu?.normal) return fiu.normal;
    if (fiu?.small) return fiu.small;
    if (fiu?.png) return fiu.png;
  }

  return null;
}

async function detectCardIdColumn(client: any) {
  const { rows } = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='products'
  `);
  const cols = new Set(rows.map((r: any) => r.column_name));
  const candidates = [
    "card_id",
    "tcg_card_id",
    "pokemon_card_id",
    "ygo_card_id",
    "mtg_card_id",
    "scryfall_id",
    "scryfall_card_id",
  ];
  for (const c of candidates) if (cols.has(c)) return c;
  return null;
}

function formatShippingWeightLb(weight: unknown) {
  // Merchant Center expects a number + unit (lb/oz/g/kg). :contentReference[oaicite:2]{index=2}
  if (weight === null || weight === undefined || weight === "") return "";
  const n = Number(weight);
  if (!Number.isFinite(n) || n <= 0) return "";

  // clean decimals (0.0600 -> 0.06)
  const cleaned = n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return `${cleaned} lb`;
}

export async function GET(req: Request) {
  if (!process.env.DATABASE_URL) {
    return new Response("Missing DATABASE_URL", { status: 500 });
  }

  const siteUrl = buildSiteUrl(req);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
  });

  const client = await pool.connect();

  try {
    const cardIdCol = await detectCardIdColumn(client);

    // If you DO have a card-id column later, these joins can enrich images.
    const joinPokemon = cardIdCol
      ? `LEFT JOIN tcg_cards tcg ON (p.game='pokemon' AND tcg.id = p.${cardIdCol})`
      : `LEFT JOIN tcg_cards tcg ON false`;

    const joinYgo = cardIdCol
      ? `LEFT JOIN ygo_card_images ygoi ON (p.game='yugioh' AND ygoi.card_id = p.${cardIdCol})`
      : `LEFT JOIN ygo_card_images ygoi ON false`;

    const joinMtg = cardIdCol
      ? `LEFT JOIN scryfall_cards_raw scr ON (p.game='mtg' AND scr.id = p.${cardIdCol})`
      : `LEFT JOIN scryfall_cards_raw scr ON false`;

    const sql = `
      SELECT
        p.id,
        p.title,
        p.slug,
        p.game,
        p.format,
        p.sealed,
        p.is_graded,
        p.grader,
        p.grade_x10,
        p.condition,
        p.price_cents,
        p.compare_at_cents,
        p.quantity,
        p.status,
        p.subtitle,
        p.description,
        p.shipping_weight_lbs,

        -- Primary image from product_images
        pi_primary.url AS primary_image_url,

        -- Additional images (comma-separated), excluding the primary
        pi_more.urls AS additional_image_urls,

        -- Enrichment sources (only if joins are active)
        tcg.image_small AS pokemon_image_small,
        tcg.image_large AS pokemon_image_large,
        ygoi.image_url AS ygo_image_url,
        scr.payload AS scryfall_payload

      FROM products p

      -- Primary product image (lowest sort)
      LEFT JOIN LATERAL (
        SELECT url
        FROM product_images
        WHERE product_id = p.id
        ORDER BY sort ASC, created_at ASC
        LIMIT 1
      ) pi_primary ON true

      -- Additional images (all others)
      LEFT JOIN LATERAL (
        SELECT STRING_AGG(url, ',') AS urls
        FROM (
          SELECT url
          FROM product_images
          WHERE product_id = p.id
          ORDER BY sort ASC, created_at ASC
          OFFSET 1
          LIMIT 10
        ) t
      ) pi_more ON true

      ${joinPokemon}
      ${joinYgo}
      ${joinMtg}

      ORDER BY p.created_at ASC NULLS LAST, p.title ASC
    `;

    const { rows } = await client.query(sql);

    const lines: string[] = [];
    lines.push(HEADERS.map((h) => sanitize(h)).join(DELIM));

    for (const r of rows) {
      const availability = mapAvailability(r.status, r.quantity);
      const qtyForGoogle = sellOnGoogleQty(r.status, r.quantity);

      const pc = Number(r.price_cents ?? 0);
      const compare =
        r.compare_at_cents === null || r.compare_at_cents === undefined || r.compare_at_cents === ""
          ? null
          : Number(r.compare_at_cents);

      let priceOut = moneyUSDFromCents(pc);
      let salePriceOut = "";

      if (compare && compare > pc) {
        priceOut = moneyUSDFromCents(compare);
        salePriceOut = moneyUSDFromCents(pc);
      }

      // Image priority:
      // 1) product_images.primary
      // 2) pokemon (tcg_cards)
      // 3) ygo image table
      // 4) mtg from scryfall payload
      // 5) placeholder
      const imageLink =
        (r.primary_image_url && String(r.primary_image_url).trim()) ||
        (r.pokemon_image_large && String(r.pokemon_image_large).trim()) ||
        (r.pokemon_image_small && String(r.pokemon_image_small).trim()) ||
        (r.ygo_image_url && String(r.ygo_image_url).trim()) ||
        extractScryfallImage(r.scryfall_payload) ||
        placeholderImageFor(siteUrl, r);

      const link = buildProductLink(siteUrl, r.slug);

      const row: Record<string, string> = {
        id: r.id,
        title: r.title,
        description: r.description || "",
        availability,
        availability_date: "",
        expiration_date: "",
        link,
        mobile_link: link,
        image_link: imageLink,
        additional_image_link: r.additional_image_urls || "",
        price: priceOut,
        sale_price: salePriceOut,
        sale_price_effective_date: "",
        shipping_weight: formatShippingWeightLb(r.shipping_weight_lbs),
        condition: mapGoogleCondition(r.condition),
        brand: "Legendary Collectibles",
        identifier_exists: "false",
        gtin: "",
        mpn: "",
        product_highlight: highlightFromRow(r),
        product_detail: detailFromRow(r),
        item_group_id: "",
        sell_on_google_quantity: String(qtyForGoogle),
      };

      lines.push(HEADERS.map((h) => sanitize(row[h] ?? "")).join(DELIM));
    }

    const body = lines.join("\r\n");
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/tab-separated-values; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return new Response(`Feed error: ${e?.message || String(e)}`, { status: 500 });
  } finally {
    client.release();
    await pool.end();
  }
}
