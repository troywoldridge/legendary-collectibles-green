import "server-only";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // If user already has an active job, return it
  const active = await db.execute<{ id: string; status: string }>(sql`
    SELECT id, status
    FROM user_revalue_jobs
    WHERE user_id = ${userId}
      AND status IN ('queued', 'running')
    ORDER BY created_at DESC
    LIMIT 1
  `);

  const existing = active.rows?.[0];
  if (existing) {
    return NextResponse.json({ ok: true, jobId: existing.id, status: existing.status });
  }

  // Create a new queued job
  const inserted = await db.execute<{ id: string }>(sql`
    INSERT INTO user_revalue_jobs (user_id, status)
    VALUES (${userId}, 'queued')
    RETURNING id
  `);

  return NextResponse.json({
    ok: true,
    jobId: inserted.rows?.[0]?.id ?? null,
    status: "queued",
  });
}
