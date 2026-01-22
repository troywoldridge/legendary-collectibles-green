/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toInt(v: string | null, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const q = (searchParams.get("q") || "").trim();
    const provider = (searchParams.get("provider") || "").trim(); // optional filter
    const type = (searchParams.get("type") || "").trim(); // optional filter (event_type)
    const limit = Math.min(100, Math.max(1, toInt(searchParams.get("limit"), 25)));
    const offset = Math.max(0, toInt(searchParams.get("offset"), 0));

    const res = await db.execute(sql`
      select
        e.id::text as id,
        e.provider,
        e.event_type as "eventType",
        e.event_id as "eventId",
        e.email_id as "emailId",
        e.message_id as "messageId",
        e.subject,
        e.from_address as "fromAddress",
        e.to_csv as "toCsv",
        e.occurred_at as "occurredAt",
        e.email_created_at as "emailCreatedAt",
        e.click_ip as "clickIp",
        e.click_link as "clickLink",
        e.click_timestamp as "clickTimestamp",
        e.error_code as "errorCode",
        e.error_message as "errorMessage",
        e.created_at as "createdAt"
      from email_events e
      where
        (${provider} = '' OR e.provider = ${provider})
        and (${type} = '' OR e.event_type = ${type})
        and (
          ${q} = '' OR
          e.id::text ilike ('%' || ${q} || '%') OR
          coalesce(e.event_id, '') ilike ('%' || ${q} || '%') OR
          coalesce(e.email_id, '') ilike ('%' || ${q} || '%') OR
          coalesce(e.message_id, '') ilike ('%' || ${q} || '%') OR
          coalesce(e.subject, '') ilike ('%' || ${q} || '%') OR
          coalesce(e.from_address, '') ilike ('%' || ${q} || '%') OR
          coalesce(e.to_csv, '') ilike ('%' || ${q} || '%') OR
          coalesce(e.error_message, '') ilike ('%' || ${q} || '%')
        )
      order by coalesce(e.occurred_at, e.created_at) desc nulls last
      limit ${limit}
      offset ${offset}
    `);

    const rows = (res as any)?.rows ?? [];
    return NextResponse.json({ ok: true, rows, limit, offset });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "email_events_list_failed", message: String(err?.message ?? err) },
      { status: 500 },
    );
  }
}
