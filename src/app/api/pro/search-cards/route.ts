/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import { getUserPlan } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ResultItem = { id: string; label: string; sub?: string | null };

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
  const q = (url.searchParams.get("q") || "").trim();
  const rawLimit = Number(url.searchParams.get("limit") || "10");
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(1, Math.floor(rawLimit)), 25)
    : 10;

  if (q.length < 2) return NextResponse.json({ results: [] });

  // --- Yu-Gi-Oh! ---
  if (game === "yugioh") {
    const rows = (await db.execute(
      sql`
        SELECT
          c.card_id AS id,
          c.name    AS name,
          (SELECT s.set_name
             FROM ygo_card_sets s
             WHERE s.card_id = c.card_id
             LIMIT 1) AS set_name
        FROM ygo_cards c
        WHERE c.name ILIKE ${"%" + q + "%"}
        ORDER BY c.name ASC
        LIMIT ${limit}
      `
    )).rows as any[];

    const results: ResultItem[] = rows.map((r) => ({
      id: r.id,
      label: r.name,
      sub: r.set_name ?? null,
    }));

    return NextResponse.json({ results });
  }

  // --- Pokémon ---
  if (game === "pokemon") {
    const rows = (await db.execute(
      sql`
        SELECT
          c.id         AS id,
          c.name       AS name,
          c."set.name" AS set_name
        FROM tcg_cards c
        WHERE c.name ILIKE ${"%" + q + "%"}
        ORDER BY c.name ASC
        LIMIT ${limit}
      `
    )).rows as any[];

    const results: ResultItem[] = rows.map((r) => ({
      id: r.id,
      label: r.name,
      sub: r.set_name ?? null,
    }));

    return NextResponse.json({ results });
  }

  // --- MTG ---
  if (game === "mtg") {
    // Assumes mtg_cards has: scryfall_id (uuid), name, set_code, collector_no
    const rows = (await db.execute(
      sql`
        SELECT
          m.scryfall_id::text AS id,
          m.name              AS name,
          CONCAT(m.set_code, ' • ', COALESCE(m.collector_no, '')) AS sub
        FROM mtg_cards m
        WHERE m.name ILIKE ${"%" + q + "%"}
           OR m.set_code ILIKE ${"%" + q + "%"}
           OR m.collector_no ILIKE ${"%" + q + "%"}
        ORDER BY m.name ASC
        LIMIT ${limit}
      `
    )).rows as any[];

    const results: ResultItem[] = rows.map((r) => ({
      id: r.id,
      label: r.name,
      sub: r.sub ?? null,
    }));

    return NextResponse.json({ results });
  }

  // Fallback
  return NextResponse.json({ results: [] });
}
