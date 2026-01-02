// src/app/api/pro/exports/movers/route.ts
import "server-only";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CollectionItem = {
  game: string;
  card_id: string;
  quantity: number;
};

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function normalizeGameKey(game: string): "pokemon" | "mtg" | "yugioh" | null {
  const g = String(game || "").toLowerCase().trim();
  if (g === "pokemon" || g === "pkm" || g === "poke") return "pokemon";
  if (g === "mtg" || g === "magic" || g === "magic: the gathering") return "mtg";
  if (g === "yugioh" || g === "ygo" || g === "yu-gi-oh" || g === "yu gi oh") return "yugioh";
  return null;
}

function splitQualified(qualified: string): { schema: string; table: string } {
  const parts = qualified.split(".");
  if (parts.length === 2) return { schema: parts[0], table: parts[1] };
  return { schema: "public", table: qualified };
}

async function getColumns(schema: string, table: string): Promise<string[]> {
  const res = await db.execute<{ column_name: string }>(sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = ${schema} AND table_name = ${table}
    ORDER BY ordinal_position
  `);
  return (res.rows ?? []).map((r) => String(r.column_name));
}

function pickFirst(cols: string[], candidates: string[]) {
  const map = new Map(cols.map((c) => [c.toLowerCase(), c]));
  for (const cand of candidates) {
    const hit = map.get(cand.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

function qident(qualified: string) {
  const { schema, table } = splitQualified(qualified);
  return `"${schema}"."${table}"`;
}

function qcol(name: string) {
  return `"${name}"`;
}

const TABLES = {
  marketItems: "public.market_items",
  daily: "public.market_price_daily",
  current: "public.market_prices_current",
} as const;

type MarketItemsCols = {
  idCol: string;
  gameCol: string;
  canonicalIdCol: string;
  canonicalSourceCol: string | null;
  displayNameCol: string | null;
  setNameCol: string | null;
  imageUrlCol: string | null;
  numberCol: string | null;
};

async function detectMarketItems(): Promise<
  { ok: true; cols: MarketItemsCols; allCols: string[] } | { ok: false; reason: string; allCols: string[] }
> {
  const { schema, table } = splitQualified(TABLES.marketItems);
  const allCols = await getColumns(schema, table);
  if (!allCols.length) {
    return { ok: false, reason: "market_items missing or has no columns", allCols };
  }

  const idCol = pickFirst(allCols, ["id"]);
  const gameCol = pickFirst(allCols, ["game", "category"]);
  const canonicalIdCol = pickFirst(allCols, ["canonical_id"]);
  const canonicalSourceCol = pickFirst(allCols, ["canonical_source"]);

  if (!idCol || !gameCol || !canonicalIdCol) {
    return {
      ok: false,
      reason: `market_items missing required columns (need id + game + canonical_id). Found: id=${String(
        idCol,
      )} game=${String(gameCol)} canonical_id=${String(canonicalIdCol)}`,
      allCols,
    };
  }

  // optional enrichments (your schema has these)
  const displayNameCol = pickFirst(allCols, ["display_name", "name", "title"]);
  const setNameCol = pickFirst(allCols, ["set_name", "set"]);
  const imageUrlCol = pickFirst(allCols, ["image_url", "image", "img_url"]);
  const numberCol = pickFirst(allCols, ["number", "collector_number"]);

  return {
    ok: true,
    cols: {
      idCol,
      gameCol,
      canonicalIdCol,
      canonicalSourceCol: canonicalSourceCol ?? null,
      displayNameCol: displayNameCol ?? null,
      setNameCol: setNameCol ?? null,
      imageUrlCol: imageUrlCol ?? null,
      numberCol: numberCol ?? null,
    },
    allCols,
  };
}

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const days = Math.max(1, Math.min(90, Number(url.searchParams.get("days") || "7")));
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit") || "100")));
  const format = (url.searchParams.get("format") || "json").toLowerCase(); // json | csv

  // 1) load collection items
  const itemsRes = await db.execute<CollectionItem>(sql`
    SELECT game, card_id, quantity
    FROM user_collection_items
    WHERE user_id = ${userId}
  `);

  const rawItems = (itemsRes.rows ?? []) as CollectionItem[];

  const items = rawItems
    .map((it) => ({
      game: normalizeGameKey(it.game),
      canonical_id: String(it.card_id || "").trim(),
      qty: Number(it.quantity || 0),
    }))
    .filter((it) => it.game && it.canonical_id && it.qty > 0) as Array<{
    game: "pokemon" | "mtg" | "yugioh";
    canonical_id: string;
    qty: number;
  }>;

  if (!items.length) {
    const payload = { days, limit, rows: [] as any[], debug: { note: "No collection items found" } };

    if (format === "csv") {
      return new Response(
        "game,canonical_id,display_name,set_name,number,image_url,quantity,from_usd,to_usd,change_pct,delta_each_usd,delta_total_usd,from_date,to_date,to_source,to_price_type\n",
        {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="movers_${days}d_${new Date()
              .toISOString()
              .slice(0, 10)}.csv"`,
            "Cache-Control": "no-store",
          },
        },
      );
    }

    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  }

  // 2) detect market_items columns
  const miDetect = await detectMarketItems();
  if (!miDetect.ok) {
    return NextResponse.json(
      {
        error: "Movers unavailable (market_items schema mismatch)",
        days,
        limit,
        debug: { market_items: { reason: miDetect.reason, cols: miDetect.allCols } },
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  const miIdent = qident(TABLES.marketItems);
  const miId = qcol(miDetect.cols.idCol);
  const miGame = qcol(miDetect.cols.gameCol);
  const miCanonicalId = qcol(miDetect.cols.canonicalIdCol);

  const miDisplay = miDetect.cols.displayNameCol ? qcol(miDetect.cols.displayNameCol) : null;
  const miSetName = miDetect.cols.setNameCol ? qcol(miDetect.cols.setNameCol) : null;
  const miImage = miDetect.cols.imageUrlCol ? qcol(miDetect.cols.imageUrlCol) : null;
  const miNumber = miDetect.cols.numberCol ? qcol(miDetect.cols.numberCol) : null;

  const dailyIdent = qident(TABLES.daily);
  const curIdent = qident(TABLES.current);

  // 3) build VALUES list (game, canonical_id, qty)
  const valuesSql = items
    .slice(0, 8000)
    .map((it) => {
      const g = String(it.game).replace(/'/g, "''");
      const c = String(it.canonical_id).replace(/'/g, "''");
      return `('${g}','${c}',${Number(it.qty)})`;
    })
    .join(",\n");

  // optional select expressions
  const selDisplay = miDisplay ? `mi.${miDisplay}::text` : `NULL::text`;
  const selSetName = miSetName ? `mi.${miSetName}::text` : `NULL::text`;
  const selImage = miImage ? `mi.${miImage}::text` : `NULL::text`;
  const selNumber = miNumber ? `mi.${miNumber}::text` : `NULL::text`;

  const raw = `
    WITH v(game, canonical_id, qty) AS (
      VALUES
      ${valuesSql}
    ),
    mapped AS (
      SELECT
        v.game,
        v.canonical_id,
        v.qty,
        mi.${miId} AS market_item_id,
        ${selDisplay} AS display_name,
        ${selSetName} AS set_name,
        ${selNumber} AS number,
        ${selImage} AS image_url
      FROM v
      JOIN ${miIdent} mi
        ON mi.${miCanonicalId}::text = v.canonical_id
       AND (
            (v.game = 'pokemon' AND lower(mi.${miGame}::text) IN ('pokemon','pkm','poke'))
         OR (v.game = 'mtg' AND lower(mi.${miGame}::text) IN ('mtg','magic','magic: the gathering'))
         OR (v.game = 'yugioh' AND lower(mi.${miGame}::text) IN ('yugioh','ygo','yu-gi-oh','yu gi oh'))
       )
    )
    SELECT
      m.game,
      m.canonical_id,
      m.qty,

      m.display_name,
      m.set_name,
      m.number,
      m.image_url,

      (cur.price_cents::numeric / 100.0) AS price_to,
      (COALESCE(past.value_cents, oldest.value_cents)::numeric / 100.0) AS price_from,

      cur.as_of_date AS to_date,
      COALESCE(past.as_of_date, oldest.as_of_date) AS from_date,

      cur.source AS to_source,
      cur.price_type AS to_price_type

    FROM mapped m

    LEFT JOIN LATERAL (
      SELECT price_cents, as_of_date, source, price_type
      FROM ${curIdent}
      WHERE market_item_id = m.market_item_id
        AND currency = 'USD'
      LIMIT 1
    ) cur ON TRUE

    LEFT JOIN LATERAL (
      SELECT value_cents, as_of_date
      FROM ${dailyIdent}
      WHERE market_item_id = m.market_item_id
        AND currency = 'USD'
        AND as_of_date <= (CURRENT_DATE - INTERVAL '${days} days')
      ORDER BY as_of_date DESC
      LIMIT 1
    ) past ON TRUE

    LEFT JOIN LATERAL (
      SELECT value_cents, as_of_date
      FROM ${dailyIdent}
      WHERE market_item_id = m.market_item_id
        AND currency = 'USD'
      ORDER BY as_of_date ASC
      LIMIT 1
    ) oldest ON TRUE

    WHERE cur.price_cents IS NOT NULL
      AND COALESCE(past.value_cents, oldest.value_cents) IS NOT NULL
  `;

  const res = await db.execute(sql.raw(raw));
  const rows = (res.rows ?? []) as any[];

  const computed = rows.map((r) => {
    const from = r.price_from == null ? null : Number(r.price_from);
    const to = r.price_to == null ? null : Number(r.price_to);
    const qty = Number(r.qty || 0);

    const changePct =
      from == null || from === 0 || to == null ? null : ((to - from) / from) * 100;

    const deltaEach = from == null || to == null ? null : to - from;
    const deltaTotal = deltaEach == null ? null : deltaEach * qty;

    return {
      game: r.game,
      canonical_id: r.canonical_id,
      qty,

      display_name: r.display_name ?? null,
      set_name: r.set_name ?? null,
      number: r.number ?? null,
      image_url: r.image_url ?? null,

      from,
      to,
      changePct,
      deltaEach,
      deltaTotal,
      fromDate: r.from_date ?? null,
      toDate: r.to_date ?? null,
      toSource: r.to_source ?? null,
      toPriceType: r.to_price_type ?? null,
    };
  });

  const top = computed
    .filter((r) => r.from != null && r.to != null && r.changePct != null)
    .sort((a, b) => Math.abs(b.deltaTotal ?? 0) - Math.abs(a.deltaTotal ?? 0))
    .slice(0, limit);

  if (format === "csv") {
    const header = [
      "game",
      "canonical_id",
      "display_name",
      "set_name",
      "number",
      "image_url",
      "quantity",
      "from_usd",
      "to_usd",
      "change_pct",
      "delta_each_usd",
      "delta_total_usd",
      "from_date",
      "to_date",
      "to_source",
      "to_price_type",
    ];

    const lines = [header.join(",")];
    for (const r of top) {
      lines.push(
        [
          csvEscape(r.game),
          csvEscape(r.canonical_id),
          csvEscape(r.display_name ?? ""),
          csvEscape(r.set_name ?? ""),
          csvEscape(r.number ?? ""),
          csvEscape(r.image_url ?? ""),
          csvEscape(r.qty),
          csvEscape(r.from ?? ""),
          csvEscape(r.to ?? ""),
          csvEscape(r.changePct ?? ""),
          csvEscape(r.deltaEach ?? ""),
          csvEscape(r.deltaTotal ?? ""),
          csvEscape(r.fromDate ?? ""),
          csvEscape(r.toDate ?? ""),
          csvEscape(r.toSource ?? ""),
          csvEscape(r.toPriceType ?? ""),
        ].join(","),
      );
    }

    const filename = `movers_${days}d_${new Date().toISOString().slice(0, 10)}.csv`;
    return new Response(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json(
    {
      days,
      limit,
      rows: top,
      debug: {
        counts: {
          input_items: items.length,
          matched_rows: rows.length,
          returned_rows: top.length,
        },
        used: {
          market_items: TABLES.marketItems,
          market_prices_current: TABLES.current,
          market_price_daily: TABLES.daily,
        },
        market_items: { matched: miDetect.cols },
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
