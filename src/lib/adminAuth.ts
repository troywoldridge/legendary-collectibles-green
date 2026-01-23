// src/lib/adminAuth.ts
import "server-only";

type AdminAuthResult = { ok: true } | { ok: false; error: string; message: string };

function readHeader(req: Request, name: string) {
  try {
    return req.headers.get(name);
  } catch {
    return null;
  }
}

function readCookie(req: Request, name: string): string | null {
  const raw = readHeader(req, "cookie") || readHeader(req, "Cookie");
  if (!raw) return null;

  const parts = raw.split(";").map((s) => s.trim());
  for (const p of parts) {
    const idx = p.indexOf("=");
    if (idx <= 0) continue;
    const k = p.slice(0, idx).trim();
    if (k !== name) continue;
    const v = p.slice(idx + 1).trim();
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  }
  return null;
}

function getTokenFromRequest(req: Request): string | null {
  // 1) Authorization: Bearer xxx
  const auth = readHeader(req, "authorization") || readHeader(req, "Authorization");
  if (auth) {
    const m = auth.match(/^\s*Bearer\s+(.+)\s*$/i);
    if (m?.[1]) return m[1].trim();
  }

  // 2) x-admin-token header
  const x = readHeader(req, "x-admin-token") || readHeader(req, "X-Admin-Token");
  if (x) return x.trim();

  // 3) cookie (what your browser actually has)
  const c = readCookie(req, "admin_ui_token");
  if (c) return c.trim();

  // 4) ?token=
  try {
    const url = new URL((req as any).url || "");
    const t = url.searchParams.get("token");
    if (t) return t.trim();
  } catch {}

  return null;
}

export function requireAdmin(req: Request): AdminAuthResult {
  const expected = (process.env.ADMIN_UI_TOKEN || "").trim();
  if (!expected) return { ok: false, error: "unauthorized", message: "Server missing ADMIN_UI_TOKEN env var" };

  const provided = getTokenFromRequest(req);
  if (!provided) return { ok: false, error: "unauthorized", message: "Missing admin token" };
  if (provided !== expected) return { ok: false, error: "unauthorized", message: "Invalid admin token" };

  return { ok: true };
}
