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

// ---- Basic same-origin guard ----
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

// ---- Bot-ish UA block (cheap heuristic) ----
function looksLikeBot(ua: string): boolean {
  const u = ua.toLowerCase();
  return (
    u.includes("bot") ||
    u.includes("crawler") ||
    u.includes("spider") ||
    u.includes("scrapy") ||
    u.includes("python") ||
    u.includes("curl") ||
    u.includes("wget") ||
    u.includes("httpclient") ||
    u.includes("node-fetch")
  );
}

// ---- In-memory rate limiter (per-process) ----
// NOTE: This is per Node process. Great for now; Cloudflare rule is the long-term "real" limiter.
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function getClientIp(req: Request): string {
  // Cloudflare sends CF-Connecting-IP; fallback to X-Forwarded-For; else unknown
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();

  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();

  return "unknown";
}

function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);

  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true as const, remaining: limit - 1, resetAt: now + windowMs };
  }

  b.count += 1;
  buckets.set(key, b);

  if (b.count > limit) {
    return { ok: false as const, remaining: 0, resetAt: b.resetAt };
  }

  return { ok: true as const, remaining: Math.max(0, limit - b.count), resetAt: b.resetAt };
}

export async function POST(req: Request) {
  try {
    // Only allow same-origin browser calls (prevents other sites from using your endpoint)
    if (!isSameOrigin(req)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // Basic bot UA block (you can loosen/tighten later)
    const ua = req.headers.get("user-agent") || "";
    if (ua && looksLikeBot(ua)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // Rate limit: 10 requests per 5 minutes per IP
    const ip = getClientIp(req);
    const rl = rateLimit(`ask-ui:${ip}`, 10, 5 * 60 * 1000);

    const headers = new Headers();
    headers.set("X-RateLimit-Limit", "10");
    headers.set("X-RateLimit-Remaining", String(rl.remaining));
    headers.set("X-RateLimit-Reset", String(Math.floor(rl.resetAt / 1000)));

    if (!rl.ok) {
      return new NextResponse(JSON.stringify({ error: "rate_limited" }), {
        status: 429,
        headers,
      });
    }

    const body: unknown = await req.json().catch(() => ({}));
    const question = pickQuestion(body);
    if (!question) {
      return new NextResponse(JSON.stringify({ error: "bad_request", message: "Missing question" }), {
        status: 400,
        headers,
      });
    }

    // Optional: basic length guard to prevent huge prompts
    if (question.length > 300) {
      return new NextResponse(JSON.stringify({ error: "bad_request", message: "Question too long." }), {
        status: 400,
        headers,
      });
    }

    const result = await askSupport(question);
    return new NextResponse(JSON.stringify(result.body), { status: result.status, headers });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: "server_error", message: msg }, { status: 500 });
  }
}
