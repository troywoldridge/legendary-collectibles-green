// src/app/google/merchant-feed/route.ts
import "server-only";

import { Pool } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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
] as const;

const DELIM = "\t";

// One pool for the lifetime of the Node process
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});

function sanitize(value: unknown) {
  if (value === null || value === undefined) return "";
  let s = String(value);

  s = s.replace(/\r\n/g, " ").replace(/\r/g, " ").replace(/\n/g, " ");
  s = s.replace(/\t/g, " ");
  s = s.replace(/\u0000/g, "");
  s = s.replace(/\s\s+/g, " ").trim();

  return s;
}

function moneyUSDFromCents(cents: unknown) {
  const n = Number(cents ?? 0);
  if (!Number.isFinite(n)) return "0.00 USD";
  const v = n / 100;
  return `${v.toFixed(2)} USD`;
}

/**
 * Canonical site url rules:
 * 1) Prefer env SITE_URL / NEXT_PUBLIC_SITE_URL
 * 2) Otherwise derive from req.url
 * 3) Force https
 * 4) Force non-www
 */
function buildSiteUrl(req: Request) {
  const env =
    process.env.SITE_URL?.replace(/\/+$/, "") ||
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");

  const raw =
    env ||
    (() => {
      const u = new URL(req.url);
      return `${u.protocol}//${u.host}`;
    })();

  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./i, "");
    return `https://${host}`;
  } catch {
    return "https://legendary-collectibles.com";
  }
}

function buildProductLink(siteUrl: string, slug: unknown) {
  const s = String(slug ?? "").trim();
  if (!s) return `${siteUrl}/products`;
  return `${siteUrl}/products/${encodeURIComponent(s)}`;
}

function mapAvailability(status: unknown, qty: unknown) {
  const s = String(status ?? "").toLowerCase();
  const q = Number(qty ?? 0);

  if (s !== "active") return "out_of_stock";
  return q > 0 ? "in_stock" : "out_of_stock";
}

function sellOnGoogleQty(status: unknown, qty: unknown) {
  const s = String(status ?? "").toLowerCase();
  if (s !== "active") return 0;
  const q = Number(qty ?? 0);
  return Number.isFinite(q) && q > 0 ? Math.floor(q) : 0;
}

function mapGoogleCondition(_cond: unknown) {
  return "new";
}

function highlightFromRow(r: any) {
  if (r?.is_graded) {
    const g = String(r.grader || "").toUpperCase().trim();

    const gx10 = Number(r.grade_x10);
    const hasGrade = Number.isFinite(gx10) && gx10 > 0;
    const gradeStr = hasGrade ? (gx10 / 10).toFixed(1) : "";

    if (g && gradeStr) return `${g} Grade ${gradeStr} collectible`;
    if (g) return `${g} graded collectible`;
    if (gradeStr) return `Grade ${gradeStr} collectible`;
    return "Graded collectible";
  }

  if (r?.sealed) return "Factory sealed product";
  if (String(r?.format || "").toLowerCase() === "accessory") return "Collector accessory";
  return "Collector-quality item";
}

function detailFromRow(r: any) {
  return r?.subtitle || "";
}

function formatShippingWeightLb(weight: unknown) {
  if (weight === null || weight === undefined || weight === "") return "";
  const n = Number(weight);
  if (!Number.isFinite(n) || n <= 0) return "";
  const cleaned = n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return `${cleaned} lb`;
}

function isAcceptedImageUrl(url: unknown) {
  const s = String(url ?? "").trim();
  if (!s) return false;
  if (!/^https?:\/\//i.test(s)) return false;

  if (s.includes("placehold.co")) return false;

  if (s.includes("imagedelivery.net/")) return true;
  if (s.includes("images.pokemontcg.io/")) return true;

  return /\.(jpe?g|png|gif)(\?.*)?$/i.test(s);
}

export async function GET(req: Request) {
  if (!process.env.DATABASE_URL) {
    return new Response("Missing DATABASE_URL", { status: 500 });
  }

  const siteUrl = buildSiteUrl(req);

  const client = await pool.connect();
  try {
    // Note: Only "active" products are included for Merchant Center safety.
    // If you truly want all statuses, remove the WHERE clause.
    const q = `
      SELECT
        p.id,
        p.sku,
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

        pi_primary.url AS primary_image_url,
        pi_more.urls AS additional_image_urls

      FROM products p

      LEFT JOIN LATERAL (
        SELECT url
        FROM product_images
        WHERE product_id = p.id
        ORDER BY
          CASE WHEN sort = 0 THEN 0 ELSE 1 END,
          sort ASC NULLS LAST,
          created_at ASC
        LIMIT 1
      ) pi_primary ON true

      LEFT JOIN LATERAL (
        SELECT STRING_AGG(url, ',') AS urls
        FROM (
          SELECT url
          FROM product_images
          WHERE product_id = p.id
            AND url IS NOT NULL
            AND url <> COALESCE(pi_primary.url, '')
          ORDER BY
            sort ASC NULLS LAST,
            created_at ASC
          LIMIT 10
        ) t
      ) pi_more ON true

      WHERE p.status = 'active'

      ORDER BY p.created_at ASC NULLS LAST, p.title ASC
    `;

    const { rows } = await client.query(q);

    const lines: string[] = [];
    lines.push(HEADERS.map((h) => sanitize(h)).join(DELIM));

    for (const r of rows) {
      const availability = mapAvailability(r.status, r.quantity);
      const qtyForGoogle = sellOnGoogleQty(r.status, r.quantity);

      const pc = Number(r.price_cents ?? 0);
      const compareRaw = r.compare_at_cents;

      const compare =
        compareRaw === null || compareRaw === undefined || compareRaw === "" ? null : Number(compareRaw);

      let priceOut = moneyUSDFromCents(pc);
      let salePriceOut = "";

      if (compare !== null && Number.isFinite(compare) && compare > pc) {
        priceOut = moneyUSDFromCents(compare);
        salePriceOut = moneyUSDFromCents(pc);
      }

      const link = buildProductLink(siteUrl, r.slug);

      const imageLink = (r.primary_image_url && String(r.primary_image_url).trim()) || "";
      if (!isAcceptedImageUrl(imageLink)) continue;

      const more = String(r.additional_image_urls || "")
        .split(",")
        .map((s: string) => s.trim())
        .filter((u: string) => isAcceptedImageUrl(u))
        .join(",");

      const row: Record<(typeof HEADERS)[number], string> = {
        id: (r.sku && String(r.sku).trim()) || String(r.id),
        title: sanitize(r.title),
        description: sanitize(r.description || r.subtitle || ""),
        availability,
        availability_date: "",
        expiration_date: "",
        link,
        mobile_link: link,
        image_link: imageLink,
        additional_image_link: more,
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
  }
}
