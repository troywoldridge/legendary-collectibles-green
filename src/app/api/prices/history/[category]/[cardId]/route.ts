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

    const url = new URL(req.url);
    const currency = (url.searchParams.get("currency") || "USD").toUpperCase();

    const daysRaw = url.searchParams.get("days") || "90";
    const days = Math.max(1, Math.min(3650, parseInt(daysRaw, 10) || 90)); // cap 10 years

    // ✅ Pokemon history comes from tcgdex_price_snapshots_daily (true daily snapshots)
    if (game === "pokemon") {
      const snapRes = await pool.query(
        `
        SELECT
          as_of_date,
          currency,
          market_price_cents,
          raw_json
        FROM public.tcgdex_price_snapshots_daily
        WHERE card_id = $1
          AND currency = $2
          AND as_of_date >= (CURRENT_DATE - $3::int)
        ORDER BY as_of_date ASC
        `,
        [cardId, currency, days]
      );

      return NextResponse.json({
        ok: true,
        game,
        canonical_id: cardId,
        canonical_source: "tcgdex",
        market_item_id: null,
        currency,
        days,
        points: snapRes.rows.map((r) => ({
          as_of_date: r.as_of_date,
          value_cents: r.market_price_cents,
          value_usd: Number(r.market_price_cents) / 100,
          confidence: null,
          method: "tcgdex_snapshot",
          sources_used: r.raw_json ?? null,
        })),
        ms: Date.now() - startedAt,
      });
    }

    // Otherwise keep your existing market_items based history for MTG/YGO
    const canonicalSource = canonicalSourceForGame(game);
    if (!canonicalSource) {
      return NextResponse.json({ error: `No canonical source mapping for category: ${category}` }, { status: 400 });
    }

    // 1) Resolve market_item_id
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
        { error: "market_item not found", game, canonical_source: canonicalSource, canonical_id: cardId },
        { status: 404 }
      );
    }

    const market_item_id = miRes.rows[0].id as string;

    // 2) Pull daily series (already blended by script 03)
    const histRes = await pool.query(
      `
      SELECT
        as_of_date,
        value_cents,
        confidence,
        sources_used,
        method
      FROM public.market_price_daily
      WHERE market_item_id = $1
        AND currency = $2
        AND as_of_date >= (CURRENT_DATE - $3::int)
      ORDER BY as_of_date ASC
      `,
      [market_item_id, currency, days]
    );

    return NextResponse.json({
      ok: true,
      game,
      canonical_id: cardId,
      canonical_source: canonicalSource,
      market_item_id,
      currency,
      days,
      points: histRes.rows.map((r) => ({
        as_of_date: r.as_of_date,
        value_cents: r.value_cents,
        value_usd: Number(r.value_cents) / 100,
        confidence: r.confidence,
        method: r.method,
        sources_used: r.sources_used,
      })),
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
