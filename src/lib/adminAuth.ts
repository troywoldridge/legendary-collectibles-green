// src/lib/adminAuth.ts
import "server-only";

import type { NextRequest } from "next/server";

type AdminAuthResult = { ok: true } | { ok: false; error: string };

function readHeader(req: Request, name: string) {
  try {
    return req.headers.get(name);
  } catch {
    return null;
  }
}

function getTokenFromRequest(req: Request): string | null {
  // 1) Authorization: Bearer xxx
  const auth = readHeader(req, "authorization") || readHeader(req, "Authorization");
  if (auth) {
    const m = auth.match(/^\s*Bearer\s+(.+)\s*$/i);
    if (m?.[1]) return m[1].trim();
  }

  // 2) x-admin-token
  const x = readHeader(req, "x-admin-token") || readHeader(req, "X-Admin-Token");
  if (x) return x.trim();

  // 3) ?token= (nice for quick manual tests)
  try {
    const url = new URL((req as any).url || "");
    const t = url.searchParams.get("token");
    if (t) return t.trim();
  } catch {}

  return null;
}

export function requireAdmin(req: NextRequest | Request): AdminAuthResult {
  // ✅ new name
  const expected =
    (process.env.ADMIN_UI_TOKEN || "").trim() ||
    (process.env.ADMIN_API_TOKEN || "").trim(); // fallback so old env still works

  if (!expected) {
    return { ok: false, error: "ADMIN_UI_TOKEN is not configured" };
  }

  const token = getTokenFromRequest(req as Request);
  if (!token) return { ok: false, error: "Missing admin token" };

  if (token !== expected) return { ok: false, error: "Invalid admin token" };

  return { ok: true };
}
