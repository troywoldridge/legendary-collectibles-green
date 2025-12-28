import "server-only";

import { NextResponse } from "next/server";
import { revalueUserCollection } from "@/lib/valuations/revalueUserCollection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readAdminToken(req: Request): string {
  const headerToken = (req.headers.get("x-admin-token") ?? "").trim();
  const authHeader = (req.headers.get("authorization") ?? "").trim();
  const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  return headerToken || bearerToken;
}

export async function POST(req: Request) {
  try {
    const token = readAdminToken(req);
    const envToken = (process.env.ADMIN_API_TOKEN ?? "").trim();

    if (!envToken || !token || token !== envToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const contentType = (req.headers.get("content-type") ?? "").toLowerCase();

    // Accept either JSON body or query param fallback
    let userId = "";

    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => null);
      userId = String(body?.userId ?? "").trim();
    } else {
      // fallback (lets curl work even if content-type weird)
      const url = new URL(req.url);
      userId = (url.searchParams.get("userId") ?? "").trim();
    }

    if (!userId) {
      return NextResponse.json(
        { error: "Missing userId", hint: "Send JSON { userId } with Content-Type: application/json" },
        { status: 400 }
      );
    }

    const result = await revalueUserCollection(userId);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? (err.stack || err.message) : String(err);
    return NextResponse.json({ error: "Internal error", detail: msg }, { status: 500 });
  }
}
