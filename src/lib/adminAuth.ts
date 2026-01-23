// src/lib/adminAuth.ts
import "server-only";

function readHeader(req: Request, name: string) {
  try {
    return req.headers.get(name);
  } catch {
    return null;
  }
}

function getTokenFromRequest(req: Request): string | null {
  // Authorization: Bearer xxx (optional)
  const auth = readHeader(req, "authorization") || readHeader(req, "Authorization");
  if (auth) {
    const m = auth.match(/^\s*Bearer\s+(.+)\s*$/i);
    if (m?.[1]) return m[1].trim();
  }

  // x-admin-token (recommended)
  const x = readHeader(req, "x-admin-token") || readHeader(req, "X-Admin-Token");
  if (x) return x.trim();

  // ?token= (optional for manual tests)
  try {
    const url = new URL((req as any).url || "");
    const t = url.searchParams.get("token");
    if (t) return t.trim();
  } catch {}

  return null;
}

export function requireAdmin(req: Request): { ok: true } | { ok: false; error: string } {
  const provided = getTokenFromRequest(req);

  // ✅ THIS must match what you put in .env
  const expected = (process.env.ADMIN_UI_Token || "").trim();

  if (!expected) return { ok: false, error: "Server missing ADMIN_UI_Token env var" };
  if (!provided) return { ok: false, error: "Missing admin token" };
  if (provided !== expected) return { ok: false, error: "Invalid admin token" };

  return { ok: true };
}
