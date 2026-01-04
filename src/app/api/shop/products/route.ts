// src/app/api/shop/products/route.ts
import { NextResponse } from "next/server";
import { and, desc, eq, ilike, inArray, isNull, asc, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/index";
import {
  products,
  productImages,
  tags,
  productTags,
} from "@/lib/db/schema/shop";

// ---- helpers ----
function toBool(v: string | null): boolean | null {
  if (v === null) return null;
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return null;
}

function toInt(v: string | null): number | null {
  if (v === null) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

const ALLOWED_GAMES = new Set(["pokemon", "yugioh", "mtg" ]);
const ALLOWED_FORMATS = new Set(["single", "pack", "box", "bundle", "lot", "accessory"]);
const ALLOWED_GRADERS = new Set(["psa", "bgs", "cgc", "sgc"]);
const ALLOWED_CONDITIONS = new Set(["nm", "lp", "mp", "hp", "dmg"]);
const ALLOWED_SORT = new Set(["featured", "new", "price_asc", "price_desc"]);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sp = url.searchParams;

    // ---- query params ----
    const game = sp.get("game");
    const format = sp.get("format");
    const sealed = toBool(sp.get("sealed"));
    const graded = toBool(sp.get("graded"));

    const grader = sp.get("grader");
    const gradeMin = toInt(sp.get("gradeMin")); // expects x10 scale (90 = 9.0, 100 = 10)
    const condition = sp.get("condition");

    const tag = sp.get("tag"); // e.g. hot-deals
    const qRaw = sp.get("q");
    const q = qRaw ? qRaw.trim() : "";

    const priceMin = toInt(sp.get("priceMin"));
    const priceMax = toInt(sp.get("priceMax"));

    const sort = sp.get("sort") ?? "featured";
    const page = clamp(toInt(sp.get("page")) ?? 1, 1, 999999);
    const limit = clamp(toInt(sp.get("limit")) ?? 24, 1, 48);
    const offset = (page - 1) * limit;

    // ---- basic validation (fail soft: ignore bad values) ----
    const filters: any[] = [eq(products.status, "active")];

    if (game && ALLOWED_GAMES.has(game)) filters.push(eq(products.game, game as any));
    if (format && ALLOWED_FORMATS.has(format)) filters.push(eq(products.format, format as any));
    if (sealed !== null) filters.push(eq(products.sealed, sealed));
    if (graded !== null) filters.push(eq(products.isGraded, graded));

    if (grader && ALLOWED_GRADERS.has(grader)) filters.push(eq(products.grader, grader as any));
    if (gradeMin !== null) filters.push(gte(products.gradeX10, gradeMin));
    if (condition && ALLOWED_CONDITIONS.has(condition)) filters.push(eq(products.condition, condition as any));

    if (priceMin !== null) filters.push(gte(products.priceCents, priceMin));
    if (priceMax !== null) filters.push(lte(products.priceCents, priceMax));

    // search across title/subtitle (simple + fast)
    if (q.length > 0) {
      // keep it safe & predictable; ilike handles partial matching
      const pattern = `%${q.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
      filters.push(
        sql`(${products.title} ILIKE ${pattern} OR ${products.subtitle} ILIKE ${pattern})`
      );
    }

    // If user explicitly wants graded=false, it’s useful to allow grader/grade to be ignored automatically
    // (We don't force anything here; filters already handle it.)

    // ---- tag filtering (join only if needed) ----
    const needsTagJoin = !!(tag && tag.trim().length > 0);

    // ---- sorting ----
    let orderByExpr;
    switch (sort && ALLOWED_SORT.has(sort) ? sort : "featured") {
      case "new":
        orderByExpr = desc(products.createdAt);
        break;
      case "price_asc":
        orderByExpr = asc(products.priceCents);
        break;
      case "price_desc":
        orderByExpr = desc(products.priceCents);
        break;
      case "featured":
      default:
        // For now: “featured” = newest updated first.
        // Later you can add products.featuredRank or products.pinned.
        orderByExpr = desc(products.updatedAt);
        break;
    }

    // ---- total count query ----
    // Count distinct products when tag join is used.
    const totalRow = needsTagJoin
      ? await db
          .select({ count: sql<number>`count(distinct ${products.id})` })
          .from(products)
          .innerJoin(productTags, eq(productTags.productId, products.id))
          .innerJoin(tags, eq(tags.id, productTags.tagId))
          .where(
            and(
              ...filters,
              eq(tags.slug, tag!.trim())
            )
          )
      : await db
          .select({ count: sql<number>`count(*)` })
          .from(products)
          .where(and(...filters));

    const total = Number(totalRow?.[0]?.count ?? 0);

    // ---- items query ----
    const rows = needsTagJoin
      ? await db
          .select({
            id: products.id,
            title: products.title,
            slug: products.slug,
            subtitle: products.subtitle,
            game: products.game,
            format: products.format,
            sealed: products.sealed,
            isGraded: products.isGraded,
            grader: products.grader,
            gradeX10: products.gradeX10,
            condition: products.condition,
            priceCents: products.priceCents,
            compareAtCents: products.compareAtCents,
            inventoryType: products.inventoryType,
            quantity: products.quantity,
            createdAt: products.createdAt,
            updatedAt: products.updatedAt,
          })
          .from(products)
          .innerJoin(productTags, eq(productTags.productId, products.id))
          .innerJoin(tags, eq(tags.id, productTags.tagId))
          .where(and(...filters, eq(tags.slug, tag!.trim())))
          .orderBy(orderByExpr)
          .limit(limit)
          .offset(offset)
      : await db
          .select({
            id: products.id,
            title: products.title,
            slug: products.slug,
            subtitle: products.subtitle,
            game: products.game,
            format: products.format,
            sealed: products.sealed,
            isGraded: products.isGraded,
            grader: products.grader,
            gradeX10: products.gradeX10,
            condition: products.condition,
            priceCents: products.priceCents,
            compareAtCents: products.compareAtCents,
            inventoryType: products.inventoryType,
            quantity: products.quantity,
            createdAt: products.createdAt,
            updatedAt: products.updatedAt,
          })
          .from(products)
          .where(and(...filters))
          .orderBy(orderByExpr)
          .limit(limit)
          .offset(offset);

    const ids = rows.map((r) => r.id);

    // ---- pull primary images (lowest sort) ----
    let imageMap = new Map<string, { url: string; alt: string | null }>();

    if (ids.length > 0) {
      const imgs = await db
        .select({
          productId: productImages.productId,
          url: productImages.url,
          alt: productImages.alt,
          sort: productImages.sort,
        })
        .from(productImages)
        .where(inArray(productImages.productId, ids))
        .orderBy(asc(productImages.productId), asc(productImages.sort));

      // first per productId wins (because ordered by sort asc)
      for (const img of imgs) {
        const key = img.productId;
        if (!imageMap.has(key)) imageMap.set(key, { url: img.url, alt: img.alt ?? null });
      }
    }

    const items = rows.map((r) => ({
      ...r,
      image: imageMap.get(r.id) ?? null,
    }));

    return NextResponse.json(
      {
        page,
        limit,
        total,
        items,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[api/shop/products] error", err);
    return NextResponse.json(
      { error: "Failed to fetch products" },
      { status: 500 }
    );
  }
}
