// src/app/api/ask-ui/route.ts
import "server-only";

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

// ---- Same-origin guard ----
function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin") || "";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";

  if (!origin || !host) return true; // allow server-to-server/curl
  try {
    const o = new URL(origin);
    return o.host === host;
  } catch {
    return false;
  }
}

// ---- Bot-ish UA block ----
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

// ---- In-memory rate limiter ----
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function getClientIp(req: Request): string {
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
    if (!isSameOrigin(req)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const ua = req.headers.get("user-agent") || "";
    if (ua && looksLikeBot(ua)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const ip = getClientIp(req);
    const rl = rateLimit(`ask-ui:${ip}`, 10, 5 * 60 * 1000);

    const headers = new Headers();
    headers.set("X-RateLimit-Limit", "10");
    headers.set("X-RateLimit-Remaining", String(rl.remaining));
    headers.set("X-RateLimit-Reset", String(Math.floor(rl.resetAt / 1000)));

    if (!rl.ok) {
      return new NextResponse(JSON.stringify({ error: "rate_limited" }), { status: 429, headers });
    }

    const body: unknown = await req.json().catch(() => ({}));
    const question = pickQuestion(body);

    if (!question) {
      return new NextResponse(JSON.stringify({ error: "bad_request", message: "Missing question" }), {
        status: 400,
        headers,
      });
    }

    if (question.length > 300) {
      return new NextResponse(JSON.stringify({ error: "bad_request", message: "Question too long." }), {
        status: 400,
        headers,
      });
    }

    // Direct call — provider swap happens inside askSupport()
    const result = await askSupport(question);
    return new NextResponse(JSON.stringify(result.body), { status: result.status, headers });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: "server_error", message: msg }, { status: 500 });
  }
}
