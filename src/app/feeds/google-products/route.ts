/* eslint-disable @typescript-eslint/no-unused-vars */
// src/app/feeds/google-products/route.ts
import "server-only";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema/products";
import { productImages } from "@/lib/db/schema/productImages";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBaseUrl(): string {
  const env =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
    process.env.SITE_URL?.replace(/\/+$/, "");
  return env || "http://127.0.0.1:3001";
}

// Adjust this if your product detail URL is different

// If you want Merchant Center to only receive ACTIVE listings, keep true.
const ONLY_ACTIVE = true;

// If you want to exclude products without images to reduce disapprovals, keep true.
const REQUIRE_IMAGE = true;

function moneyUsdFromCents(cents: number | null | undefined): string {
  const v = Number(cents || 0) / 100;
  return `${v.toFixed(2)} USD`;
}

// TSV cell escaping (tabs/newlines/quotes)
function tsvCell(v: unknown): string {
  const s = String(v ?? "");
  const needsQuote = /[\t\n\r"]/.test(s);
  if (!needsQuote) return s;
  return `"${s.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
}

// product_highlight: min 2 values if present, max 10.
// Values are comma-separated; quote individual values if they contain commas/quotes.
function highlightValue(v: string): string {
  const needsQuote = /[",]/.test(v);
  if (!needsQuote) return v;
  return `"${v.replace(/"/g, '""')}"`;
}

function conditionLabel(dbCond: unknown): string | null {
  const c = String(dbCond ?? "").toLowerCase();
  if (!c) return null;
  if (c === "new_factory_sealed") return "New (Factory Sealed)";
  if (c === "nm") return "Near Mint condition";
  if (c === "lp") return "Lightly Played condition";
  if (c === "mp") return "Moderately Played condition";
  if (c === "hp") return "Heavily Played condition";
  if (c === "dmg") return "Damaged condition";
  return null;
}

function buildHighlights(p: any): string {
  const out: string[] = [];

  // Always have at least 2
  out.push(conditionLabel(p?.condition) || "Condition noted in listing");
  out.push("Ships well-protected");

  // Graded callout
  if (p?.is_graded) {
    const grader = p?.grader ? String(p.grader).toUpperCase() : "Graded";
    const grade = Number(p?.grade_x10);
    if (Number.isFinite(grade) && grade > 0) out.push(`${grader} ${grade}/10`);
    else out.push(`${grader} graded`);
  }

  // Tailor by game
  const g = String(p?.game ?? "").toLowerCase();
  if (g === "yugioh") out.push("Authentic Yu-Gi-Oh! item");
  if (g === "pokemon") out.push("Authentic Pokémon item");
  if (g === "mtg") out.push("Authentic Magic: The Gathering item");

  // Sealed callout
  if (p?.sealed || String(p?.format ?? "").toLowerCase() === "sealed") {
    out.push("Factory sealed when listed");
  }

  // Keep within 10
  return out.slice(0, 6).map(highlightValue).join(", ");
}

function inferAvailability(p: any): string {
  const status = String(p?.status ?? "").toLowerCase();
  if (status !== "active") return "out_of_stock";

  const invType = String(p?.inventory_type ?? "").toLowerCase();
  const qty = Number(p?.quantity ?? 0);

  // infinite: always in stock
  if (invType === "infinite") return "in_stock";

  // unique: treat >0 as in_stock
  if (invType === "unique") return qty > 0 ? "in_stock" : "out_of_stock";

  // stock (default): standard quantity behavior
  return qty > 0 ? "in_stock" : "out_of_stock";
}

function inferGoogleCondition(p: any): string {
  // Google expects: new | used | refurbished
  // Sealed items are "new".
  if (p?.sealed || String(p?.format ?? "").toLowerCase() === "sealed") return "new";

  // Everything else is "used" (even Near Mint singles)
  return "used";
}

function inferBrand(p: any): string {
  // Brand is commonly required
  const g = String(p?.game ?? "").toLowerCase();
  if (g === "yugioh") return "Konami";
  if (g === "pokemon") return "Pokémon";
  if (g === "mtg") return "Wizards of the Coast";
  return "Legendary Collectibles";
}

function inferGoogleCategory(_p: any): string {
  // Safe umbrella category for TCG items & sealed
  return "Toys & Games > Games > Trading Card Games";
}

function buildProductType(p: any): string {
  const parts = [
    String(p?.game || "other"),
    String(p?.format || "item"),
  ];

  if (p?.sealed) parts.push("sealed");
  if (p?.is_graded) parts.push("graded");
  if (p?.card_kind) parts.push(String(p.card_kind));

  return parts.filter(Boolean).join(" > ");
}

export async function GET() {
  const baseUrl = getBaseUrl();

  const rows = await db.execute(sql`
    WITH first_image AS (
      SELECT DISTINCT ON (pi.product_id)
        pi.product_id,
        pi.url
      FROM ${productImages} pi
      ORDER BY pi.product_id, pi.sort ASC, pi.created_at ASC
    )
    SELECT
      p.id,
      p.slug,
      p.title,
      p.subtitle,
      p.description,
      p.game,
      p.format,
      p.sealed,
      p.is_graded,
      p.grader,
      p.grade_x10,
      p.condition,
      p.inventory_type,
      p.quantity,
      p.status,
      p.price_cents,
      p.sku,
      p.card_kind,
      p.shipping_weight_lbs,
      p.shipping_class,
      fi.url AS image_url
    FROM ${products} p
    LEFT JOIN first_image fi ON fi.product_id = p.id
    WHERE p.slug IS NOT NULL
  `);

  
  const header = [
  "id",
  "title",
  "description",
  "link",
  "image_link",
  "availability",
  "price",
  "condition",
  "brand",
  "mpn",
  "identifier_exists",
  "google_product_category",
  "product_type",
  "shipping_weight",
  "custom_label_0",
  "product_highlight",
].join("\t");


  const lines: string[] = [header];

  const data: any[] = (rows as any)?.rows ?? (rows as any);

  const debugCount = data.length;

  // TEMP DEBUG: expose count so you can see what the app DB returns
  // Remove once confirmed.

  for (const p of data) {
    const slug = String(p.slug || "").trim();
    const title = String(p.title || "").trim();
    const priceCents = Number(p.price_cents ?? 0);
    const status = String(p.status || "").toLowerCase();

    if (!slug || !title) continue;
    if (!Number.isFinite(priceCents) || priceCents <= 0) continue;

    if (ONLY_ACTIVE && status !== "active") continue;

    const link = `${baseUrl}/products/${encodeURIComponent(String(p.id))}`;

    const imageLink = p.image_url ? String(p.image_url) : "";
    if (REQUIRE_IMAGE && !imageLink) continue;

    const availability = inferAvailability(p);
    const gCondition = inferGoogleCondition(p);
    const brand = inferBrand(p);

    // Use sku as MPN when present; fallback to slug
    const mpn = (String(p.sku || "").trim() || slug).toUpperCase();

    // Cards generally have no GTIN; tell Google that identifiers don't exist
    const identifierExists = "no";

    const googleCategory = inferGoogleCategory(p);
    const productType = buildProductType(p);
    const highlights = buildHighlights(p);

    // Prefer subtitle + description if present
    const desc = String(p.description || "").trim();
    const sub = String(p.subtitle || "").trim();
    const description = (sub && desc) ? `${sub} — ${desc}` : (desc || title);
    const shippingWeight =
        p.shipping_weight_lbs
          ? `${Number(p.shipping_weight_lbs).toFixed(2)} lb`
          : "1 lb";


    const row = [
  slug,
  title,
  description,
  link,
  imageLink,
  availability,
  moneyUsdFromCents(priceCents),
  gCondition,
  brand,
  mpn,
  identifierExists,
  googleCategory,
  productType,
  shippingWeight,
  highlights,
]
  .map(tsvCell)
  .join("\t");

    lines.push(row);
  }

    return new NextResponse(lines.join("\n"), {
    headers: {
      "content-type": "text/tab-separated-values; charset=utf-8",
      "cache-control": "no-store",
      "x-feed-total-rows": String(data.length),
      "x-feed-exported-rows": String(lines.length - 1),
    },
  });

}
