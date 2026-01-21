import { NextResponse } from "next/server";
import { askSupport } from "@/lib/ai/askSupport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonObject = Record<string, unknown>;
function isObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null;
}

function pickQuestion(body: unknown): string {
  if (!isObject(body)) return "";
  const q = body["question"];
  return typeof q === "string" ? q.trim() : "";
}

// Basic same-origin guard (keeps random cross-site posts out)
function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin") || "";
  const host = req.headers.get("host") || "";
  if (!origin || !host) return true; // curl/server-to-server
  try {
    const o = new URL(origin);
    return o.host === host;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  try {
    if (!isSameOrigin(req)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const body: unknown = await req.json().catch(() => ({}));
    const question = pickQuestion(body);
    if (!question) {
      return NextResponse.json({ error: "bad_request", message: "Missing question" }, { status: 400 });
    }

    const result = await askSupport(question);
    return NextResponse.json(result.body, { status: result.status });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: "server_error", message: msg }, { status: 500 });
  }
}
