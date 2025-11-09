import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// eBay will call this with a "challenge" during destination verification.
// Just echo it back as required.
export async function GET(req: NextRequest) {
  const challenge = req.nextUrl.searchParams.get("challenge");
  if (challenge) return new NextResponse(challenge, { status: 200 });
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  console.log("[eBay Notifications API]", body?.metadata?.topic, body?.notification);
  // TODO: persist / act on MARKETPLACE_ACCOUNT_DELETION events
  return NextResponse.json({ ok: true });
}
