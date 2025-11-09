// src/app/api/admin/email-events/route.ts
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { emailEvents } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Optional: simple bearer token gate. Set ADMIN_API_TOKEN in prod to protect this API.
// If you use Clerk middleware site-wide, you can delete this.
function checkAuth(req: NextRequest) {
  const tok = process.env.ADMIN_API_TOKEN;
  if (!tok) return true; // unprotected if not set
  const h = req.headers.get("authorization") || "";
  return h === `Bearer ${tok}`;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
  const per = Math.min(200, Math.max(1, Number(url.searchParams.get("per") || "50")));
  const q = (url.searchParams.get("q") || "").trim();
  const type = (url.searchParams.get("type") || "").trim(); // e.g. "email.delivered"
  const from = (url.searchParams.get("from") || "").trim(); // ISO date
  const to = (url.searchParams.get("to") || "").trim();     // ISO date
  const format = (url.searchParams.get("format") || "").trim(); // "csv" to export

  const where: any[] = [];

  if (type && type !== "all") {
    where.push(eq(emailEvents.eventType, type));
  }

  if (q) {
    const pat = `%${q}%`;
    where.push(
      or(
        ilike(emailEvents.subject, pat),
        ilike(emailEvents.fromAddress, pat),
        ilike(emailEvents.toCsv, pat),
        ilike(emailEvents.messageId, pat),
        ilike(emailEvents.emailId, pat),
        ilike(emailEvents.errorMessage, pat),
      )
    );
  }

  // Date range on occurred_at
  if (from) where.push(gte(emailEvents.occurredAt, new Date(from)));
  if (to)   where.push(lte(emailEvents.occurredAt, new Date(to)));

  const cond = where.length ? and(...where) : undefined;

  // total count
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(emailEvents)
    .where(cond);

  // page rows
  const rows = await db
    .select()
    .from(emailEvents)
    .where(cond)
    .orderBy(desc(emailEvents.occurredAt))
    .limit(per)
    .offset((page - 1) * per);

  // CSV export
  if (format === "csv") {
    const headers = [
      "id","event_id","event_type","occurred_at",
      "email_id","subject","from_address","to_csv","message_id","email_created_at",
      "click_ip","click_link","click_timestamp","click_user_agent",
      "error_code","error_message","provider","idempotency_key","created_at"
    ];

    const esc = (v: any) => {
      if (v == null) return "";
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const lines = [
      headers.join(","),
      ...rows.map(r =>
        [
          r.id, r.eventId, r.eventType, r.occurredAt?.toISOString() ?? "",
          r.emailId, r.subject, r.fromAddress, r.toCsv, r.messageId, r.emailCreatedAt?.toISOString() ?? "",
          r.clickIp, r.clickLink, r.clickTimestamp?.toISOString() ?? "", r.clickUserAgent,
          r.errorCode, r.errorMessage, r.provider, r.idempotencyKey, r.createdAt?.toISOString() ?? ""
        ].map(esc).join(",")
      )
    ].join("\n");

    return new NextResponse(lines, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="email-events-p${page}.csv"`,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    page,
    per,
    total: count,
    rows,
  });
}
