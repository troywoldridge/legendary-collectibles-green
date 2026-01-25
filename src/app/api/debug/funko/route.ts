import "server-only";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const rows =
    (
      await db.execute(sql`
        select
          current_database() as db,
          inet_server_addr()::text as server_addr,
          inet_server_port()::int as server_port,
          (select count(*) from public.funko_items)::int as funko_count,
          (
            select jsonb_build_object(
              'id', id,
              'image_large', image_large,
              'image_small', image_small,
              'updated_at', updated_at
            )
            from public.funko_items
            order by updated_at desc nulls last
            limit 1
          ) as latest
      `)
    ).rows?.[0] ?? null;

  return NextResponse.json({ ok: true, rows });
}
