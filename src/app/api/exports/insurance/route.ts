// src/app/api/exports/insurance/route.ts
import "server-only";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getUserPlan } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ---------- CSV helpers ---------- */
function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: Record<string, unknown>[], header: string[]): string {
  const lines: string[] = [];
  lines.push(header.map(csvEscape).join(","));
  for (const r of rows) lines.push(header.map((h) => csvEscape(r[h])).join(","));
  return lines.join("\n") + "\n";
}

function asPositiveNumber(raw: string | null, fallback: number) {
  const n = Number(raw ?? "");
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

type ExportRow = {
  game: string;
  card_id: string;
  name: string | null;
  variant_type: string | null;
  quantity: number;
  current_price_usd: number | null;
  current_value_usd: number | null;
};

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Pro gate
  const plan = await getUserPlan(userId);
  if (!plan.features.insuranceReports) {
    return NextResponse.json(
      { error: "Insurance reports are a Pro feature." },
      { status: 403 },
    );
  }

  const url = new URL(req.url);
  const thresholdUsd = asPositiveNumber(url.searchParams.get("threshold"), 250);

  const rows =
    (
      await db.execute<ExportRow>(sql`
      WITH items AS (
        SELECT
          u.game::text AS game,
          u.card_id::text AS card_id,
          COALESCE(NULLIF(u.variant_type,''), 'normal')::text AS variant_type,
          COALESCE(u.quantity,0)::int AS quantity
        FROM public.user_collection_items u
        WHERE u.user_id = ${userId}
      ),

      names AS (
        -- Pokémon
        SELECT 'pokemon'::text AS game, c.id::text AS card_id, c.name::text AS name
        FROM public.tcg_cards c
        UNION ALL
        -- MTG (Scryfall)
        SELECT 'mtg'::text AS game, c.id::text AS card_id, COALESCE(c.name::text, (c.payload->>'name'))::text AS name
        FROM public.scryfall_cards_raw c
        UNION ALL
        -- Yu-Gi-Oh!
        SELECT 'yugioh'::text AS game, c.card_id::text AS card_id, c.name::text AS name
        FROM public.ygo_cards c
      ),

      prices AS (
        -- Pokémon: best representative tcgplayer price for card_id (USD)
        SELECT
          'pokemon'::text AS game,
          p.card_id::text AS card_id,
          COALESCE(
            MAX(CASE WHEN LOWER(p.variant_type) = 'normal' THEN p.market_price::numeric END),
            MAX(p.market_price::numeric),
            MAX(p.mid_price::numeric),
            MAX(p.low_price::numeric),
            MAX(p.high_price::numeric)
          )::float8 AS price_usd
        FROM public.tcg_card_prices_tcgplayer p
        GROUP BY p.card_id

        UNION ALL

        -- MTG: effective USD if present else scryfall latest usd
        SELECT
          'mtg'::text AS game,
          c.id::text AS card_id,
          COALESCE(e.effective_usd, s.usd)::float8 AS price_usd
        FROM public.scryfall_cards_raw c
        LEFT JOIN public.mtg_prices_effective e       ON e.scryfall_id = c.id
        LEFT JOIN public.mtg_prices_scryfall_latest s ON s.scryfall_id = c.id

        UNION ALL

        -- YGO: best available USD-ish price
        SELECT
          'yugioh'::text AS game,
          p.card_id::text AS card_id,
          COALESCE(
            NULLIF(p.tcgplayer_price,0),
            NULLIF(p.ebay_price,0),
            NULLIF(p.amazon_price,0),
            NULLIF(p.coolstuffinc_price,0),
            NULLIF(p.cardmarket_price,0)
          )::float8 AS price_usd
        FROM public.ygo_card_prices p
      )

      SELECT
        i.game,
        i.card_id,
        n.name,
        i.variant_type,
        i.quantity,
        pr.price_usd AS current_price_usd,
        (COALESCE(pr.price_usd, 0) * i.quantity)::float8 AS current_value_usd
      FROM items i
      LEFT JOIN names  n  ON n.game = i.game AND n.card_id = i.card_id
      LEFT JOIN prices pr ON pr.game = i.game AND pr.card_id = i.card_id
      WHERE (COALESCE(pr.price_usd, 0) * i.quantity) >= ${thresholdUsd}
      ORDER BY current_value_usd DESC NULLS LAST
    `)
    ).rows ?? [];

  const out = rows.map((r) => ({
    game: r.game,
    card_id: r.card_id,
    name: r.name ?? "",
    variant_type: r.variant_type ?? "normal",
    quantity: r.quantity,
    current_price_usd: r.current_price_usd != null ? r.current_price_usd.toFixed(2) : "",
    line_value_usd: r.current_value_usd != null ? r.current_value_usd.toFixed(2) : "",
    threshold_usd: thresholdUsd.toFixed(2),
  }));

  const header = [
    "game",
    "card_id",
    "name",
    "variant_type",
    "quantity",
    "current_price_usd",
    "line_value_usd",
    "threshold_usd",
  ];

  const csv = toCsv(out, header);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="insurance_${thresholdUsd}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
