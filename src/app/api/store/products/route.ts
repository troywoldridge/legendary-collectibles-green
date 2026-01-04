// src/app/api/store/products/route.ts
import "server-only";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function norm(v: unknown) {
  const s = String(v ?? "").trim();
  try {
    return decodeURIComponent(s).trim().toLowerCase();
  } catch {
    return s.trim().toLowerCase();
  }
}

function int(v: string | null, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseBool(v: string | null) {
  if (v == null) return null;
  const s = norm(v);
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return null;
}

/**
 * Converts category slugs into DB filters.
 * Supports:
 *  - NEW: single|pack|box|bundle|lot|accessory|all
 *  - OLD: singles|graded|booster-boxes|sleeves|etc
 */
function categoryToFilters(category: string) {
  const c = norm(category);

  // ✅ NEW direct formats
  if (c === "single" || c === "pack" || c === "box" || c === "bundle" || c === "lot" || c === "accessory") {
    return { format: c, sealed: null as boolean | null, is_graded: null as boolean | null };
  }
  if (c === "all") {
    return { format: null, sealed: null, is_graded: null };
  }

  // ✅ OLD aliases (keep compatibility)
  switch (c) {
    // cards
    case "singles":
      return { format: "single", sealed: null, is_graded: null };
    case "graded":
      return { format: "single", sealed: null, is_graded: true };

    // sealed packs
    case "blister-packs":
    case "booster-packs":
    case "play-boosters":
    case "collector-boosters":
      return { format: "pack", sealed: true, is_graded: null };

    // sealed boxes
    case "booster-boxes":
      return { format: "box", sealed: true, is_graded: null };

    // sealed bundles
    case "elite-trainer-boxes":
    case "bundles":
    case "collections":
    case "structure-decks":
    case "commander-decks":
      return { format: "bundle", sealed: true, is_graded: null };

    // accessories
    case "sleeves":
    case "toploaders":
    case "binders":
    case "deck-boxes":
    case "playmats":
    case "storage":
      return { format: "accessory", sealed: null, is_graded: null };

    default:
      return { format: null, sealed: null, is_graded: null };
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  // ✅ Support both query styles:
  // Style A (new pages): /api/store/products?department=pokemon&category=single
  // Style B (newer pages): /api/store/products?game=pokemon&format=single
  const department = norm(url.searchParams.get("department")); // pokemon|yugioh|mtg|accessories
  const category = norm(url.searchParams.get("category")); // single|pack|box|bundle|lot|accessory|all or old slugs
  const game = norm(url.searchParams.get("game")); // pokemon|yugioh|mtg
  const format = norm(url.searchParams.get("format")); // single|pack|box|bundle|lot|accessory

  const q = url.searchParams.get("q")?.trim() ?? "";
  const sort = norm(url.searchParams.get("sort") ?? "new");
  const page = Math.max(1, int(url.searchParams.get("page"), 1));
  const limit = Math.min(48, Math.max(1, int(url.searchParams.get("limit"), 24)));
  const offset = (page - 1) * limit;

  const priceMin = url.searchParams.get("priceMin");
  const priceMax = url.searchParams.get("priceMax");

  const grader = norm(url.searchParams.get("grader") ?? "");
  const gradeMin = url.searchParams.get("gradeMin");

  // ✅ New boolean filters (optional)
  const sealedParam = parseBool(url.searchParams.get("sealed"));
  const gradedParam = parseBool(url.searchParams.get("graded"));

  // Determine base filters from either (game/format) OR (department/category)
  const cat = categoryToFilters(category);

  // ✅ Prefer explicit game/format if provided
  const effectiveGame =
    game || (department && department !== "accessories" ? department : "");

  const effectiveFormat =
    format || cat.format || "";

  // ✅ Accessories department means: show accessory format across all games
  // If department=accessories, force format accessory unless format explicitly given.
  const isAccessoriesDept = department === "accessories";

  // Status filter (your DB sample shows active products exist)
  const STATUS = "active";

  const orderBy =
    sort === "price_asc"
      ? sql`p.price_cents ASC, p.updated_at DESC`
      : sort === "price_desc"
      ? sql`p.price_cents DESC, p.updated_at DESC`
      : sql`p.updated_at DESC`;

  const where: any[] = [sql`p.status = ${STATUS}`];

  // game filter (not for accessories dept)
  if (!isAccessoriesDept && effectiveGame) {
    where.push(sql`p.game::text = ${effectiveGame}`);
  }

  // format filter
  if (isAccessoriesDept) {
    // accessories always means accessory format, unless caller explicitly overrides with format param
    where.push(sql`p.format::text = ${effectiveFormat || "accessory"}`);
  } else if (effectiveFormat) {
    where.push(sql`p.format::text = ${effectiveFormat}`);
  }

  // sealed/is_graded base filters from category mapping (old behavior)
  if (cat.sealed !== null) where.push(sql`p.sealed = ${cat.sealed}`);
  if (cat.is_graded !== null) where.push(sql`p.is_graded = ${cat.is_graded}`);

  // ✅ explicit sealed/graded overrides (new filters)
  if (sealedParam !== null) where.push(sql`p.sealed = ${sealedParam}`);
  if (gradedParam !== null) where.push(sql`p.is_graded = ${gradedParam}`);

  // search
  if (q.length) {
    where.push(
      sql`(
        p.title ILIKE ${"%" + q + "%"}
        OR p.subtitle ILIKE ${"%" + q + "%"}
        OR p.description ILIKE ${"%" + q + "%"}
      )`,
    );
  }

  // price
  if (priceMin && /^\d+$/.test(priceMin)) where.push(sql`p.price_cents >= ${Number(priceMin)}`);
  if (priceMax && /^\d+$/.test(priceMax)) where.push(sql`p.price_cents <= ${Number(priceMax)}`);

  // grader / grade
  if (grader) where.push(sql`p.grader::text = ${grader}`);
  if (gradeMin && /^\d+$/.test(gradeMin)) where.push(sql`p.grade_x10 >= ${Number(gradeMin)}`);

  const whereSql = sql`WHERE ${sql.join(where, sql` AND `)}`;

  const itemsQuery = sql`
    SELECT
      p.id,
      p.title,
      p.subtitle,
      p.slug,
      p.game::text AS game,
      p.format::text AS format,
      p.sealed,
      p.is_graded,
      p.grader::text AS grader,
      p.grade_x10,
      p.condition::text AS condition,
      p.price_cents,
      p.compare_at_cents,
      p.inventory_type::text AS inventory_type,
      p.quantity,
      p.updated_at,
      (
        SELECT pi.url
        FROM product_images pi
        WHERE pi.product_id = p.id
        ORDER BY pi.sort ASC, pi.created_at ASC
        LIMIT 1
      ) AS image_url
    FROM products p
    ${whereSql}
    ORDER BY ${orderBy}
    LIMIT ${limit} OFFSET ${offset}
  `;

  const countQuery = sql`
    SELECT COUNT(*)::int AS total
    FROM products p
    ${whereSql}
  `;

  const [itemsRes, countRes] = await Promise.all([
    db.execute(itemsQuery),
    db.execute(countQuery),
  ]);

  const items = (itemsRes?.rows ?? []) as any[];
  const total = Number((countRes?.rows?.[0] as any)?.total ?? 0);

  return NextResponse.json({
    items,
    total,
    page,
    limit,

    // echo back (useful for debugging)
    department,
    category,
    game: effectiveGame || null,
    format: effectiveFormat || (isAccessoriesDept ? "accessory" : null),
    sealed: sealedParam,
    graded: gradedParam,
    sort,
    q,
  });
}
