// src/app/api/funko/related/route.ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { queryRelatedFunko } from "@/lib/funko/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const itemId = (url.searchParams.get("itemId") ?? "").trim();
  if (!itemId) {
    return NextResponse.json({ error: "bad_request", message: "Missing itemId" }, { status: 400 });
  }

  const franchise = (url.searchParams.get("franchise") ?? "").trim() || null;
  const series = (url.searchParams.get("series") ?? "").trim() || null;
  const limit = clampInt(Number(url.searchParams.get("limit") ?? 48) || 48, 6, 200);

  const items = await queryRelatedFunko({ itemId, franchise, series, limit });

  return NextResponse.json(
    { items },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
