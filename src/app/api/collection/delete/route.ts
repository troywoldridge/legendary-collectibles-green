// src/app/api/collection/delete/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";

type DeleteCollectionItemBody = {
  id?: string;
};

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: DeleteCollectionItemBody;
  try {
    body = (await req.json()) as DeleteCollectionItemBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id } = body ?? {};
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  // We don't need the result value here, just ensure the query runs
  await db.execute(
    sql`DELETE FROM user_collection_items WHERE id = ${id} AND user_id = ${userId}`
  );

  return NextResponse.json({ ok: true });
}
