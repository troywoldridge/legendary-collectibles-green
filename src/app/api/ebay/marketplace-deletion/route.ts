import crypto from "node:crypto";
import { db } from "@/lib/db";
  import { ebayEvents } from "@/lib/db/schema/ebayEvents";

export const runtime = "nodejs";

const WEBHOOK_URL =
  process.env.EBAY_DELETE_WEBHOOK_URL ||
  "https://www.legendary-collectibles.com/api/ebay/marketplace-deletion";
const VERIFY_TOKEN = process.env.EBAY_DELETE_VERIFY_TOKEN || "";

/**
 * eBay will call: GET <WEBHOOK_URL>?challenge_code=<random>
 * Respond with:  { "challengeResponse": SHA256(challengeCode + verifyToken + endpoint) }
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const challengeCode = url.searchParams.get("challenge_code");
  if (!challengeCode || !VERIFY_TOKEN) {
    return new Response("missing challenge_code or verify token", { status: 400 });
  }
  const input = `${challengeCode}${VERIFY_TOKEN}${WEBHOOK_URL}`;
  const challengeResponse = crypto.createHash("sha256").update(input).digest("hex");
  return new Response(JSON.stringify({ challengeResponse }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: Request) {
  // Real deletion events arrive as POST JSON
  const body = await req.text();
  console.log("[eBay MAD] event:", body?.slice(0, 2000));

  // ---- TODO: persist to DB (uncomment after you add a table) ----
  
  await db.insert(ebayEvents).values({
  source: "marketplace-deletion",
  eventType: "MARKETPLACE_ACCOUNT_DELETION",
  payload: body,
  });

  return new Response("", { status: 200 });
}
