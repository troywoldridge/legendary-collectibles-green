// src/app/api/exports/collection/route.ts
import "server-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getUserPlan } from "@/lib/plans";

// ---------- CSV helpers ----------
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

type Game = "all" | "pokemon" | "mtg" | "yugioh";
function asGame(raw: string | null): Game {
  const v = (raw ?? "").toLowerCase().trim();
  return v === "pokemon" || v === "mtg" || v === "yugioh" ? v : "all";
}

function centsToUsd(cents: number | null): number | null {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return null;
  return cents / 100;
}

function n2(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(String(v ?? ""));
  return Number.isFinite(n) ? n : null;
}

// ---------- Route ----------
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const plan = await getUserPlan(userId);
  if (!plan.features.csvExports) {
    return NextResponse.json({ error: "CSV exports are a Pro feature." }, { status: 403 });
  }

  const url = new URL(req.url);
  const game = asGame(url.searchParams.get("game"));

  const rows =
    (
      await db.execute<{
        game: string;
        card_id: string;
        variant_type: string | null;
        quantity: number;
        cost_cents: number | null;
        name: string | null;
        set_name: string | null;
        current_price_usd: number | null;
        price_source: string | null;
        price_updated: string | null;
      }>(sql`
        WITH items AS (
          SELECT
            u.game,
            u.card_id,
            COALESCE(NULLIF(u.variant_type,''), 'normal') AS variant_type,
            COALESCE(u.quantity,0)::int AS quantity,
            u.cost_cents
          FROM public.user_collection_items u
          WHERE u.user_id = ${userId}
            AND (${game} = 'all' OR u.game = ${game})
        ),

        pokemon_prices AS (
          SELECT
            p.card_id,
            COALESCE(
              MAX(CASE WHEN LOWER(p.variant_type) = 'normal' THEN p.market_price::numeric END),
              MAX(p.market_price::numeric),
              MAX(p.mid_price::numeric),
              MAX(p.low_price::numeric),
              MAX(p.high_price::numeric)
            )::float8 AS price_usd,
            MAX(TO_CHAR(p.updated_at::date,'YYYY-MM-DD')) AS updated
          FROM public.tcg_card_prices_tcgplayer p
          GROUP BY p.card_id
        ),

        mtg_prices AS (
          SELECT
            c.id::text AS card_id,
            COALESCE(e.effective_usd, s.usd)::float8 AS price_usd,
            COALESCE(
              TO_CHAR(e.effective_updated_at::date,'YYYY-MM-DD'),
              TO_CHAR(s.updated_at::date,'YYYY-MM-DD')
            ) AS updated
          FROM public.scryfall_cards_raw c
          LEFT JOIN public.mtg_prices_effective e       ON e.scryfall_id = c.id
          LEFT JOIN public.mtg_prices_scryfall_latest s ON s.scryfall_id = c.id
        ),

        ygo_prices AS (
          SELECT
            p.card_id::text AS card_id,
            COALESCE(
              NULLIF(p.tcgplayer_price,0),
              NULLIF(p.ebay_price,0),
              NULLIF(p.amazon_price,0),
              NULLIF(p.coolstuffinc_price,0),
              NULLIF(p.cardmarket_price,0)
            )::float8 AS price_usd,
            NULL::text AS updated
          FROM public.ygo_card_prices p
        )

        SELECT
          i.game,
          i.card_id,
          i.variant_type,
          i.quantity,
          i.cost_cents,

          CASE
            WHEN i.game = 'pokemon' THEN (SELECT c.name FROM public.tcg_cards c WHERE c.id = i.card_id LIMIT 1)
            WHEN i.game = 'mtg' THEN (SELECT c.name FROM public.scryfall_cards_raw c WHERE c.id::text = i.card_id LIMIT 1)
            WHEN i.game = 'yugioh' THEN (SELECT c.name FROM public.ygo_cards c WHERE c.card_id::text = i.card_id LIMIT 1)
            ELSE NULL
          END AS name,

          CASE
            WHEN i.game = 'pokemon' THEN (SELECT c.set_name FROM public.tcg_cards c WHERE c.id = i.card_id LIMIT 1)
            WHEN i.game = 'mtg' THEN (
              SELECT s.name
              FROM public.scryfall_sets s
              JOIN public.scryfall_cards_raw c ON LOWER(s.code) = LOWER(c.set_code)
              WHERE c.id::text = i.card_id
              LIMIT 1
            )
            ELSE NULL
          END AS set_name,

          CASE
            WHEN i.game = 'pokemon' THEN (SELECT pp.price_usd FROM pokemon_prices pp WHERE pp.card_id = i.card_id LIMIT 1)
            WHEN i.game = 'mtg' THEN (SELECT mp.price_usd FROM mtg_prices mp WHERE mp.card_id = i.card_id LIMIT 1)
            WHEN i.game = 'yugioh' THEN (SELECT yp.price_usd FROM ygo_prices yp WHERE yp.card_id = i.card_id LIMIT 1)
            ELSE NULL
          END AS current_price_usd,

          CASE
            WHEN i.game = 'pokemon' THEN 'tcgplayer'
            WHEN i.game = 'mtg' THEN 'scryfall/effective'
            WHEN i.game = 'yugioh' THEN 'ygo_sources'
            ELSE NULL
          END AS price_source,

          CASE
            WHEN i.game = 'pokemon' THEN (SELECT pp.updated FROM pokemon_prices pp WHERE pp.card_id = i.card_id LIMIT 1)
            WHEN i.game = 'mtg' THEN (SELECT mp.updated FROM mtg_prices mp WHERE mp.card_id = i.card_id LIMIT 1)
            ELSE NULL
          END AS price_updated

        FROM items i
        ORDER BY i.game, name NULLS LAST, i.card_id
      `)
    ).rows ?? [];

  const out = rows.map((r) => {
    const costUsd = centsToUsd(r.cost_cents);
    const current = n2(r.current_price_usd);
    const qty = n2(r.quantity) ?? 0;
    const currentValue = current != null ? current * qty : null;

    return {
      game: r.game,
      card_id: r.card_id,
      name: r.name ?? "",
      set_name: r.set_name ?? "",
      variant_type: r.variant_type ?? "normal",
      quantity: r.quantity,
      cost_usd: costUsd != null ? costUsd.toFixed(2) : "",
      current_price_usd: current != null ? current.toFixed(2) : "",
      current_value_usd: currentValue != null ? currentValue.toFixed(2) : "",
      price_source: r.price_source ?? "",
      price_updated: r.price_updated ?? "",
    };
  });

  const header = [
    "game",
    "card_id",
    "name",
    "set_name",
    "variant_type",
    "quantity",
    "cost_usd",
    "current_price_usd",
    "current_value_usd",
    "price_source",
    "price_updated",
  ];

  const csv = toCsv(out, header);
  const filename = game === "all" ? "collection_all.csv" : `collection_${game}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
