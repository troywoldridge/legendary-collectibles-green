import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sha256Hex(s: string) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

// eBay will GET ?challenge_code=... to verify your endpoint
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const challengeCode = url.searchParams.get("challenge_code");
  if (!challengeCode) {
    return NextResponse.json({ error: "missing challenge_code" }, { status: 400 });
  }

  const token = process.env.EBAY_MADN_VERIFY_TOKEN || "";
  if (!token) {
    return NextResponse.json({ error: "server missing EBAY_MADN_VERIFY_TOKEN" }, { status: 500 });
  }

  // Use the EXACT endpoint you configured in eBay (safer to set explicitly)
  const endpoint = process.env.EBAY_MADN_ENDPOINT || `${url.origin}/api/ebay/account-deletion`;

  // Spec: SHA-256 over (challengeCode + verificationToken + endpoint)
  const challengeResponse = sha256Hex(challengeCode + token + endpoint);

  return NextResponse.json({ challengeResponse }, { headers: { "content-type": "application/json" } });
}

// eBay will POST actual Marketplace Account Deletion events here
export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => null);
  // TODO: verify X-EBAY-SIGNATURE (optional but recommended)
  console.log("[eBay MADN]", JSON.stringify(payload)?.slice(0, 2000));
  return NextResponse.json({ ok: true });
}
