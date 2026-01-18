import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function norm(v: unknown) {
  return String(v ?? "").trim();
}

function toInt(v: unknown, fallback: number, max = 200) {
  const n = Number(String(v ?? ""));
  if (!Number.isFinite(n)) return fallback;
  const m = Math.floor(n);
  if (m < 1) return fallback;
  return Math.min(m, max);
}

function toBool(v: unknown): boolean | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const game = norm(searchParams.get("game")).toLowerCase(); // pokemon|yugioh|mtg|sports
  const format = norm(searchParams.get("format")).toLowerCase(); // single|pack|box|bundle|lot|accessory
  const sort = norm(searchParams.get("sort")).toLowerCase() || "featured";

  const page = toInt(searchParams.get("page"), 1, 999999);
  const limit = toInt(searchParams.get("limit"), 24, 96);
  const offset = (page - 1) * limit;

  const q = norm(searchParams.get("q"));
  const sealed = toBool(searchParams.get("sealed"));
  const graded = toBool(searchParams.get("graded"));
  const grader = norm(searchParams.get("grader")).toLowerCase();
  const condition = norm(searchParams.get("condition")).toLowerCase();

  const priceMin = norm(searchParams.get("priceMin"));
  const priceMax = norm(searchParams.get("priceMax"));

  // Basic WHERE building
  const where: any[] = [];
  where.push(sql`p.status = 'active'`);

  if (game) where.push(sql`p.game = ${game}::game`);
  if (format) where.push(sql`p.format = ${format}::product_format`);

  if (sealed !== null) where.push(sql`p.sealed = ${sealed}`);
  if (graded !== null) where.push(sql`p.is_graded = ${graded}`);

  if (grader) where.push(sql`lower(p.grader::text) = ${grader}`);
  if (condition) where.push(sql`lower(p.condition::text) = ${condition}`);

  if (priceMin && !Number.isNaN(Number(priceMin))) where.push(sql`p.price_cents >= ${Number(priceMin)}`);
  if (priceMax && !Number.isNaN(Number(priceMax))) where.push(sql`p.price_cents <= ${Number(priceMax)}`);

  if (q) {
    // basic search on title/subtitle/sku
    const like = `%${q.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
    where.push(sql`(
      p.title ILIKE ${like}
      OR coalesce(p.subtitle,'') ILIKE ${like}
      OR coalesce(p.sku,'') ILIKE ${like}
    )`);
  }

  const whereSql = where.length ? sql`where ${sql.join(where, sql` and `)}` : sql``;

  // Sorting
  // Sorting (make it deterministic with a tie-breaker)
let orderBy = sql`p.updated_at desc, p.id desc`;

if (sort === "price_asc") orderBy = sql`p.price_cents asc, p.updated_at desc, p.id desc`;
if (sort === "price_desc") orderBy = sql`p.price_cents desc, p.updated_at desc, p.id desc`;
if (sort === "new") orderBy = sql`p.created_at desc, p.id desc`;
// featured -> updated_at desc, id desc

  // featured -> keep updated_at desc for now

  // COUNT
  const countRow = await db.execute<{ count: string }>(sql`
    select count(*)::text as count
    from products p
    ${whereSql}
  `);
  const total = Number(countRow.rows?.[0]?.count ?? "0");

  // ITEMS + FIRST IMAGE (this is the critical part)
 // ITEMS + IMAGE (Pokemon pulls from tcg_cards via source_card_id)
const rows = await db.execute(sql`
  select
    p.id,
    p.title,
    p.slug,
    p.subtitle,
    p.game::text as game,
    p.format::text as format,
    p.sealed,
    p.is_graded as "isGraded",
    p.grader::text as grader,
    p.grade_x10 as "gradeX10",
    p.condition::text as condition,
    p.price_cents as "priceCents",
    p.compare_at_cents as "compareAtCents",
    p.inventory_type::text as "inventoryType",
    p.quantity,

    -- Pokemon-first image strategy (HIRES):
    case
      when p.game = 'pokemon'::game
       and tcg.small_image is not null
       and tcg.small_image <> ''
       and tcg.small_image like 'https://images.pokemontcg.io/%'
      then
        regexp_replace(tcg.small_image, '\.png$', '_hires.png')
      else
        pi.url
    end as "imageUrl",

    case
      when p.game = 'pokemon'::game and tcg.small_image is not null and tcg.small_image <> '' then null
      else pi.alt
    end as "imageAlt"

  from products p

  left join tcg_cards tcg
    on p.game = 'pokemon'::game
   and tcg.id = p.source_card_id

  left join lateral (
    select url, alt
    from product_images
    where product_id = p.id
    order by sort asc
    limit 1
  ) pi on true

  ${whereSql}
  order by ${orderBy}
  limit ${limit}
  offset ${offset}
`);


  const items = (rows.rows ?? []).map((r: any) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    subtitle: r.subtitle ?? null,
    game: r.game,
    format: r.format,
    sealed: r.sealed,
    isGraded: r.isGraded,
    grader: r.grader ?? null,
    gradeX10: r.gradeX10 ?? null,
    condition: r.condition ?? null,
    priceCents: Number(r.priceCents ?? 0),
    compareAtCents: r.compareAtCents != null ? Number(r.compareAtCents) : null,
    inventoryType: r.inventoryType ?? null,
    quantity: r.quantity != null ? Number(r.quantity) : null,
    image: r.imageUrl ? { url: r.imageUrl, alt: r.imageAlt ?? null } : null,
  }));

  return NextResponse.json(
    { items, total, page, limit },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
