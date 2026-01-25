// src/app/api/funko/items/route.ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { queryFunkoItems } from "@/lib/funko/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function asBool(v: string | null): boolean | null {
  if (!v) return null;
  const s = v.trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(s)) return true;
  if (["0", "false", "no", "n"].includes(s)) return false;
  return null;
}

function asInt(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  const q = url.searchParams.get("q") ?? "";
  const franchise = url.searchParams.get("franchise") ?? "";
  const series = url.searchParams.get("series") ?? "";
  const chase = asBool(url.searchParams.get("chase"));
  const exclusive = asBool(url.searchParams.get("exclusive"));
  const rarity = url.searchParams.get("rarity") ?? "";
  const yearMin = asInt(url.searchParams.get("yearMin"));
  const yearMax = asInt(url.searchParams.get("yearMax"));
  const priceMin = asInt(url.searchParams.get("priceMin"));
  const priceMax = asInt(url.searchParams.get("priceMax"));
  const sort = (url.searchParams.get("sort") ?? "relevance") as any;
  const order = (url.searchParams.get("order") ?? "desc") as any;
  const page = asInt(url.searchParams.get("page")) ?? 1;
  const pageSize = asInt(url.searchParams.get("pageSize")) ?? 48;

  const data = await queryFunkoItems({
    q,
    franchise: franchise || undefined,
    series: series || undefined,
    chase,
    exclusive,
    rarity: rarity || undefined,
    yearMin: yearMin ?? undefined,
    yearMax: yearMax ?? undefined,
    priceMin: priceMin ?? undefined,
    priceMax: priceMax ?? undefined,
    sort,
    order,
    page,
    pageSize,
  });

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
