import "server-only";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { getUserPlan, canSeeTrends } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

type Row = {
  id: string;
  game: string;
  rule_type: string;
  threshold: string | number;
  active: boolean;
  created_at: string;

  market_item_id: string;
  display_name: string | null;
  set_name: string | null;
  number: string | null;
  canonical_id: string | null;
  canonical_source: string | null;
};

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const plan = await getUserPlan(userId);
  if (!canSeeTrends(plan)) {
    return NextResponse.json({ error: "Pro required" }, { status: 402 });
  }

  const res = await db.execute<Row>(sql`
    SELECT
      a.id,
      a.game,
      a.rule_type,
      a.threshold,
      a.active,
      a.created_at,

      a.market_item_id,
      mi.display_name,
      mi.set_name,
      mi.number,
      mi.canonical_id,
      mi.canonical_source
    FROM price_alerts a
    JOIN market_items mi ON mi.id = a.market_item_id
    WHERE a.user_id = ${userId}
    ORDER BY a.created_at DESC
  `);

  const rows = (res.rows ?? []) as Row[];

  const header = [
    "id",
    "game",
    "rule_type",
    "threshold_usd",
    "active",
    "created_at",
    "market_item_id",
    "display_name",
    "set_name",
    "number",
    "canonical_id",
    "canonical_source",
  ];

  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.id),
        csvEscape(r.game),
        csvEscape(r.rule_type),
        csvEscape(r.threshold),
        csvEscape(r.active),
        csvEscape(r.created_at),

        csvEscape(r.market_item_id),
        csvEscape(r.display_name ?? ""),
        csvEscape(r.set_name ?? ""),
        csvEscape(r.number ?? ""),
        csvEscape(r.canonical_id ?? ""),
        csvEscape(r.canonical_source ?? ""),
      ].join(","),
    );
  }

  return new NextResponse(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="price_alerts_${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
