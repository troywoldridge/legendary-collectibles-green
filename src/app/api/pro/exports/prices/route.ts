import "server-only";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import { getUserPlan } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PriceRow = {
  card_id: string | null;
  name: string | null;
  set_name: string | null;
  set_code: string | null;
  set_rarity: string | null;
  tcgplayer: number | null;
  cardmarket: number | null;
  ebay: number | null;
  amazon: number | null;
  coolstuffinc: number | null;
};

function csvEscape(v: unknown) {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // src/app/api/pro/alerts/route.ts

  const plan = await getUserPlan(userId);

  // Use maxItemsTotal here, not maxItems
  const maxItemsTotal = plan?.limits?.maxItemsTotal ?? 0;

  if (maxItemsTotal <= 0) {
    return NextResponse.json({ error: "Pro required" }, { status: 402 });
  }


  const url = new URL(req.url);
  const game = (url.searchParams.get("game") || "yugioh").toLowerCase();
  const setName = url.searchParams.get("set");
  const filename = `prices-${game}${setName ? "-" + setName.replace(/\s+/g, "_") : ""}-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;

  let outRows: PriceRow[] = [];

  if (game === "yugioh") {
    const where = setName ? sql`WHERE s.set_name = ${setName}` : sql``;
    const res = await db.execute<PriceRow>(sql`
      SELECT
        c.card_id                 AS card_id,
        c.name                    AS name,
        s.set_name                AS set_name,
        s.set_code                AS set_code,
        s.set_rarity              AS set_rarity,
        p.tcgplayer_price         AS tcgplayer,
        p.cardmarket_price        AS cardmarket,
        p.ebay_price              AS ebay,
        p.amazon_price            AS amazon,
        p.coolstuffinc_price      AS coolstuffinc
      FROM ygo_cards c
      LEFT JOIN ygo_card_sets   s ON s.card_id = c.card_id
      LEFT JOIN ygo_card_prices p ON p.card_id = c.card_id
      ${where}
      ORDER BY s.set_name NULLS LAST, c.name ASC
    `);
    outRows = (res.rows ?? []) as PriceRow[];
  } else if (game === "pokemon") {
    const where = setName ? sql`WHERE c."set.name" = ${setName}` : sql``;
    const res = await db.execute<PriceRow>(sql`
      SELECT
        c.id                     AS card_id,
        c.name                   AS name,
        c."set.name"             AS set_name,
        c.number                 AS set_code,
        c.rarity                 AS set_rarity,
        COALESCE(
          tp.market_normal,
          tp.market_holofoil,
          tp.market_reverse_holofoil,
          tp.market_1st_holofoil,
          tp.market_1st_normal
        )                        AS tcgplayer,
        cm.trend_price           AS cardmarket,
        NULL::numeric            AS ebay,
        NULL::numeric            AS amazon,
        NULL::numeric            AS coolstuffinc
      FROM tcg_cards c
      LEFT JOIN tcg_card_prices_tcgplayer  tp ON tp.card_id = c.id
      LEFT JOIN tcg_card_prices_cardmarket cm ON cm.card_id = c.id
      ${where}
      ORDER BY c."set.name" NULLS LAST, c.name ASC
    `);
    outRows = (res.rows ?? []) as PriceRow[];
  } else if (game === "mtg") {
    const where = setName ? sql`WHERE m.set_code = ${setName}` : sql``;
    const res = await db.execute<PriceRow>(sql`
      SELECT
        m.scryfall_id::text      AS card_id,
        m.name                   AS name,
        m.set_code               AS set_name,
        m.collector_no           AS set_code,
        NULL::text               AS set_rarity,
        mp.usd                   AS tcgplayer,   -- proxy
        mp.eur                   AS cardmarket,  -- proxy
        NULL::numeric            AS ebay,
        NULL::numeric            AS amazon,
        NULL::numeric            AS coolstuffinc
      FROM mtg_cards m
      LEFT JOIN mtg_card_prices mp ON mp.scryfall_id = m.scryfall_id
      ${where}
      ORDER BY m.set_code NULLS LAST, m.name ASC
    `);
    outRows = (res.rows ?? []) as PriceRow[];
  } else {
    return NextResponse.json({ error: "game must be yugioh, pokemon, or mtg" }, { status: 400 });
  }

  const header = [
    "card_id",
    "name",
    "set_name",
    "set_code",
    "set_rarity",
    "tcgplayer",
    "cardmarket",
    "ebay",
    "amazon",
    "coolstuffinc",
  ];
  const lines: string[] = [header.join(",")];

  for (const r of outRows) {
    lines.push(
      [
        r.card_id,
        r.name,
        r.set_name,
        r.set_code,
        r.set_rarity,
        r.tcgplayer,
        r.cardmarket,
        r.ebay,
        r.amazon,
        r.coolstuffinc,
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
