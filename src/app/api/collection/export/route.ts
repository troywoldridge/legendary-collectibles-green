// src/app/api/collection/export/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getUserPlan } from "@/lib/plans";

export const runtime = "nodejs";

type Row = {
  id: string;
  game: string | null;
  card_id: string | null;
  card_name: string | null;
  set_name: string | null;
  image_url: string | null;
  grading_company: string | null;
  grade_label: string | null;
  cert_number: string | null;
  quantity: number | null;
  folder: string | null;
  cost_cents: number | null;
  last_value_cents: number | null;
  purchase_date: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const plan = await getUserPlan(userId);
  const isPro = plan.id === "pro";

  if (!isPro) {
    return NextResponse.json(
      {
        error: "Plan limit",
        message:
          "CSV export is available on the Pro Collector plan.",
        plan: plan.id,
        upgradeUrl: "/pricing",
      },
      { status: 403 },
    );
  }

  let rows: Row[] = [];

  try {
    const res = await db.execute<Row>(sql`
      SELECT
        id,
        game,
        card_id,
        card_name,
        set_name,
        image_url,
        grading_company,
        grade_label,
        cert_number,
        quantity,
        folder,
        cost_cents,
        last_value_cents,
        purchase_date::text,
        created_at::text,
        updated_at::text
      FROM user_collection_items
      WHERE user_id = ${userId}
      ORDER BY game ASC, set_name ASC NULLS LAST, card_name ASC NULLS LAST
    `);

    rows = res.rows ?? [];
  } catch (err) {
    console.error("collection/export query failed", err);
    return NextResponse.json(
      { error: "Database error exporting collection" },
      { status: 500 },
    );
  }

  const header = [
    "id",
    "game",
    "card_id",
    "card_name",
    "set_name",
    "image_url",
    "grading_company",
    "grade_label",
    "cert_number",
    "quantity",
    "folder",
    "cost_cents",
    "last_value_cents",
    "purchase_date",
    "created_at",
    "updated_at",
  ];

  const lines: string[] = [];
  lines.push(header.join(","));

  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.id),
        csvEscape(r.game),
        csvEscape(r.card_id),
        csvEscape(r.card_name),
        csvEscape(r.set_name),
        csvEscape(r.image_url),
        csvEscape(r.grading_company),
        csvEscape(r.grade_label),
        csvEscape(r.cert_number),
        csvEscape(r.quantity ?? 0),
        csvEscape(r.folder),
        csvEscape(r.cost_cents ?? 0),
        csvEscape(r.last_value_cents ?? 0),
        csvEscape(r.purchase_date),
        csvEscape(r.created_at),
        csvEscape(r.updated_at),
      ].join(","),
    );
  }

  const csv = lines.join("\r\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="legendary-collection.csv"',
      "Cache-Control": "no-store",
    },
  });
}
