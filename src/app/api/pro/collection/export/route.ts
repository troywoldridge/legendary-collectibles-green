import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getUserPlan } from "@/lib/plans";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  game: string | null;
  card_id: string | null;
  set_name: string | null;
  number: string | null;
  qty: number | null;
  purchase_price_cents: number | null;
  purchased_at: string | null;
  image_url: string | null;
};

function csvEscape(v: unknown) {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const plan = await getUserPlan(userId);
  if ((plan?.limits?.maxItems ?? 0) <= 0) {
    return NextResponse.json({ error: "Pro required" }, { status: 402 });
  }

  // Adjust table/columns if your collection table differs.
  const rows = (await db.execute<Row>(sql`
    SELECT id, game, card_id, set_name, number, qty,
           purchase_price_cents, purchased_at, image_url
    FROM collection_items
    WHERE user_id = ${userId}
    ORDER BY game ASC, set_name ASC NULLS LAST, number ASC NULLS LAST
  `)).rows as Row[];

  const header = [
    "id","game","card_id","set_name","number","qty",
    "purchase_price","purchased_at","image_url"
  ];
  const out: string[] = [header.join(",")];

  for (const r of rows) {
    const purchasePrice =
      r.purchase_price_cents == null ? "" : (Number(r.purchase_price_cents) / 100).toFixed(2);

    out.push([
      r.id,
      r.game ?? "",
      r.card_id ?? "",
      r.set_name ?? "",
      r.number ?? "",
      r.qty ?? 0,
      purchasePrice,
      r.purchased_at ?? "",
      r.image_url ?? "",
    ].map(csvEscape).join(","));
  }

  const filename = `collection-${new Date().toISOString().slice(0,10)}.csv`;
  return new NextResponse(out.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
