import "server-only";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    has_ADMIN_UI_TOKEN: !!process.env.ADMIN_UI_TOKEN,
    has_ADMIN_UI_Token: !!process.env.ADMIN_UI_Token,
  });
}
