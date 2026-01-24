import "server-only";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      origin: process.env.ORIGIN_NAME ?? "unknown",
      port: process.env.PORT ?? null,
      host: process.env.HOSTNAME ?? null,
      now: new Date().toISOString(),
    },
    { status: 200 },
  );
}
