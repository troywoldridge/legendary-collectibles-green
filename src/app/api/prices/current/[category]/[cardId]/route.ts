import "server-only";
import { NextResponse } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

type Game = "pokemon" | "mtg" | "yugioh";

function normCategory(raw: string): Game | null {
  const c = (raw || "").toLowerCase().trim();
  if (c === "pokemon") return "pokemon";
  if (c === "mtg" || c === "magic") return "mtg";
  if (c === "yugioh" || c === "ygo") return "yugioh";
  return null;
}

function canonicalSourceForGame(game: Game) {
  if (game === "pokemon") return "tcgdex";
  if (game === "mtg") return "scryfall";
  if (game === "yugioh") return "ygo";
  return null;
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ category: string; cardId: string }> }
) {
  const startedAt = Date.now();

  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ error: "DATABASE_URL is not set" }, { status: 500 });
    }

    const { category, cardId } = await ctx.params;

    const game = normCategory(category);
    if (!game) {
      return NextResponse.json({ error: `Unknown category: ${category}` }, { status: 400 });
    }

    const canonicalSource = canonicalSourceForGame(game);
    if (!canonicalSource) {
      return NextResponse.json(
        { error: `No canonical source mapping for category: ${category}` },
        { status: 400 }
      );
    }

    const url = new URL(req.url);
    const currency = (url.searchParams.get("currency") || "USD").toUpperCase();

    // 1) Resolve market_item_id using the UNIQUE key
    const miRes = await pool.query(
      `
      SELECT id
      FROM public.market_items
      WHERE game = $1
        AND canonical_source = $2
        AND canonical_id = $3
      LIMIT 1
      `,
      [game, canonicalSource, cardId]
    );

    if (miRes.rowCount === 0) {
      return NextResponse.json(
        {
          error: "market_item not found",
          game,
          canonical_source: canonicalSource,
          canonical_id: cardId,
        },
        { status: 404 }
      );
    }

    const market_item_id = miRes.rows[0].id as string;

    // 2) Fetch current price row
    const curRes = await pool.query(
      `
      SELECT
        market_item_id,
        currency,
        price_cents,
        source,
        price_type,
        confidence,
        as_of_date,
        sources_used,
        updated_at
      FROM public.market_prices_current
      WHERE market_item_id = $1
        AND currency = $2
      LIMIT 1
      `,
      [market_item_id, currency]
    );

    if (curRes.rowCount === 0) {
      return NextResponse.json(
        {
          error: "no current price for item",
          game,
          canonical_source: canonicalSource,
          canonical_id: cardId,
          currency,
          market_item_id,
        },
        { status: 404 }
      );
    }

    const row = curRes.rows[0];

    return NextResponse.json({
      ok: true,
      game,
      canonical_source: canonicalSource,
      canonical_id: cardId,
      market_item_id,
      currency: row.currency,
      price_cents: row.price_cents,
      price_usd: Number(row.price_cents) / 100,
      source: row.source,
      price_type: row.price_type,
      confidence: row.confidence,
      as_of_date: row.as_of_date,
      sources_used: row.sources_used,
      updated_at: row.updated_at,
      ms: Date.now() - startedAt,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || String(err),
        stack: process.env.NODE_ENV === "development" ? err?.stack : undefined,
      },
      { status: 500 }
    );
  }
}
