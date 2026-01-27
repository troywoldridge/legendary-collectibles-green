// src/app/api/shop/products/route.ts
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

/** -------------------------
 *  Canonical allow-lists
 *  ------------------------- */

// "collectibles" is a SPECIAL BUCKET, not a true "game equals collectibles" filter.
const ALLOWED_GAMES = ["pokemon", "yugioh", "mtg", "sports", "funko", "collectibles"] as const;

type AllowedGame = (typeof ALLOWED_GAMES)[number];

const ALLOWED_GAMES_SET = new Set<AllowedGame>(ALLOWED_GAMES);

function isAllowedGame(v: string): v is AllowedGame {
  return ALLOWED_GAMES_SET.has(v as AllowedGame);
}

// normalize plural slugs -> enum values
function normFormat(v: string) {
  const s = (v || "").trim().toLowerCase();
  if (!s) return "";
  if (s === "singles") return "single";
  if (s === "packs") return "pack";
  if (s === "boxes") return "box";
  if (s === "bundles") return "bundle";
  if (s === "lots") return "lot";
  if (s === "accessories") return "accessory";
  return s;
}

function normGame(v: string) {
  const s = (v || "").trim().toLowerCase();
  if (!s) return "";

  if (s === "ygo" || s === "yu-gi-oh" || s === "yu-gi-oh!") return "yugioh";
  if (s === "magic") return "mtg";

  // Treat these as the SPECIAL BUCKET
  if (s === "collectible") return "collectibles";
  if (s === "figures" || s === "figure") return "collectibles";

  return s;
}

// "13/98" -> 13
const leadingInt = (expr: any) =>
  sql`nullif(regexp_replace(coalesce(${expr}::text, ''), '[^0-9].*$', ''), '')::int`;

// "LOB-001" -> 1
const anyInt = (expr: any) =>
  sql`nullif(regexp_replace(coalesce(${expr}::text, ''), '[^0-9]+', '', 'g'), '')::int`;

const pokemonReleaseDate = sql`nullif(replace(coalesce(tcg.release_date, ''), '/', '-'), '')::date`;

const UUID_RE =
  "^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const gameRaw = normGame(norm(searchParams.get("game")));
  const format = normFormat(norm(searchParams.get("format")));
  const sortRaw = norm(searchParams.get("sort")).toLowerCase();
  const sort = sortRaw || "featured";

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

  const game: AllowedGame | "" = gameRaw ? (isAllowedGame(gameRaw) ? gameRaw : "") : "";

  if (gameRaw && !game) {
    return NextResponse.json(
      {
        error: "bad_request",
        message: `Invalid game '${gameRaw}'. Allowed: ${ALLOWED_GAMES.join(", ")}.`,
      },
      { status: 400, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  const where: any[] = [];
  where.push(sql`p.status = 'active'`);

  /**
   * ✅ KEY FIX:
   * collectibles = bucket = NOT pokemon/yugioh/mtg/funko
   */
  if (game === "collectibles") {
    where.push(
      sql`p.game not in ('pokemon'::game, 'yugioh'::game, 'mtg'::game, 'funko'::game)`,
    );
  } else if (game) {
    where.push(sql`p.game = ${game}::game`);
  }

  if (format) where.push(sql`p.format = ${format}::product_format`);

  if (sealed !== null) where.push(sql`p.sealed = ${sealed}`);
  if (graded !== null) where.push(sql`p.is_graded = ${graded}`);

  if (grader) where.push(sql`lower(p.grader::text) = ${grader}`);
  if (condition) where.push(sql`lower(p.condition::text) = ${condition}`);

  if (priceMin && !Number.isNaN(Number(priceMin))) where.push(sql`p.price_cents >= ${Number(priceMin)}`);
  if (priceMax && !Number.isNaN(Number(priceMax))) where.push(sql`p.price_cents <= ${Number(priceMax)}`);

  if (q) {
    const like = `%${q.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
    where.push(sql`(
      p.title ILIKE ${like}
      OR coalesce(p.subtitle,'') ILIKE ${like}
      OR coalesce(p.sku,'') ILIKE ${like}
    )`);
  }

  const whereSql = where.length ? sql`where ${sql.join(where, sql` and `)}` : sql``;

  const isSingles = format === "single";
  const effectiveSort = isSingles && (sort === "featured" || !sortRaw) ? "set_number" : sort;

  let orderBy = sql`p.updated_at desc, p.id desc`;
  if (effectiveSort === "price_asc") orderBy = sql`p.price_cents asc, p.updated_at desc, p.id desc`;
  if (effectiveSort === "price_desc") orderBy = sql`p.price_cents desc, p.updated_at desc, p.id desc`;
  if (effectiveSort === "new") orderBy = sql`p.created_at desc, p.id desc`;

  if (effectiveSort === "set_number") {
    orderBy = sql`
      coalesce(${pokemonReleaseDate}, ss.released_at) asc nulls last,
      coalesce(tcg.set_name, ss.name, ycs.set_name, ycs.set_code) asc nulls last,

      coalesce(
        ${leadingInt(sql`tcg.number`)},
        ${anyInt(sql`ycs.set_code`)},
        ${leadingInt(sql`scry.collector_number`)},
        ${anyInt(sql`scry.collector_number`)}
      ) asc nulls last,

      coalesce(tcg.name, ygo.name, scry.name) asc nulls last,
      p.updated_at desc,
      p.id desc
    `;
  }

  const countRow = await db.execute<{ count: string }>(sql`
    select count(*)::text as count
    from products p
    ${whereSql}
  `);
  const total = Number(countRow.rows?.[0]?.count ?? "0");

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

      coalesce(tcg.set_name, ss.name, ycs.set_name, ycs.set_code) as "setName",
      coalesce(tcg.number::text, ycs.set_code::text, scry.collector_number::text) as "cardNumber",

      case
        when p.game = 'pokemon'::game
         and tcg.small_image is not null
         and tcg.small_image <> ''
         and tcg.small_image like 'https://images.pokemontcg.io/%'
        then regexp_replace(tcg.small_image, '\.png$', '_hires.png')
        else pi.url
      end as "imageUrl",

      case
        when p.game = 'pokemon'::game and tcg.small_image is not null and tcg.small_image <> '' then null
        else pi.alt
      end as "imageAlt"

    from products p

    left join tcg_cards tcg
      on p.game = 'pokemon'::game
     and tcg.id = p.source_card_id

    left join ygo_cards ygo
      on p.game = 'yugioh'::game
     and ygo.card_id = p.source_card_id

    left join lateral (
      select ycs.set_code, ycs.set_name
      from ygo_card_sets ycs
      where ycs.card_id = ygo.card_id
      order by ycs.set_code asc nulls last
      limit 1
    ) ycs on true

    left join scryfall_cards_raw scry
      on scry.id = (
        case
          when p.game = 'mtg'::game and p.source_card_id ~* ${UUID_RE}
          then p.source_card_id::uuid
          else null
        end
      )

    left join scryfall_sets ss
      on ss.id = scry.set_id

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
    setName: r.setName ?? null,
    number: r.cardNumber ?? null,
    image: r.imageUrl ? { url: r.imageUrl, alt: r.imageAlt ?? null } : null,
  }));

  return NextResponse.json(
    { items, total, page, limit },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
