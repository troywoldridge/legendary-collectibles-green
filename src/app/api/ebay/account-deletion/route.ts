import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sha256Hex(s: string) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

// eBay will GET ?challenge_code=... to verify your endpoint
export async function GET(req: NextRequest) {
  const challengeCode = req.nextUrl.searchParams.get("challenge_code");
  if (!challengeCode) {
    return NextResponse.json(
      { error: "missing challenge_code" },
      { status: 400 },
    );
  }

  const token = process.env.EBAY_MADN_VERIFY_TOKEN || "";
  if (!token) {
    return NextResponse.json(
      { error: "server missing EBAY_MADN_VERIFY_TOKEN" },
      { status: 500 },
    );
  }

  const endpoint = process.env.EBAY_MADN_ENDPOINT || "";
  if (!endpoint) {
    return NextResponse.json(
      {
        error:
          "server missing EBAY_MADN_ENDPOINT (must match EXACT eBay-registered URL)",
      },
      { status: 500 },
    );
  }

  // Spec: SHA-256 over (challengeCode + verificationToken + endpoint)
  // Order matters.
  const challengeResponse = sha256Hex(challengeCode + token + endpoint);

  return NextResponse.json(
    { challengeResponse },
    { headers: { "content-type": "application/json" } },
  );
}

// eBay will POST actual Marketplace Account Deletion events here
export async function POST(req: NextRequest) {
  const raw = await req.text(); // keep raw for future signature verification
  let payload: unknown = null;

  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    // If eBay ever sends something unexpected, don't 500 and fail their delivery.
    payload = { unparsed: raw?.slice(0, 2000) };
  }

  console.log("[eBay MADN]", typeof payload === "string" ? payload : JSON.stringify(payload).slice(0, 2000));

  // Always respond 200 quickly.
  return NextResponse.json({ ok: true });
}
