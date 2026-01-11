import "server-only";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const url = new URL(req.url);
  url.pathname = "/api/checkout/sessions";
  return NextResponse.redirect(url.toString(), 307); // preserve POST
}
