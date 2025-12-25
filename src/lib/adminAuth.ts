import { NextRequest } from "next/server";

export function requireAdmin(req: NextRequest) {
  const token = req.headers.get("x-admin-token") || "";
  const expected = process.env.ADMIN_API_TOKEN || "";

  if (!expected) {
    return { ok: false as const, error: "ADMIN_API_TOKEN not set on server" };
  }
  if (!token || token !== expected) {
    return { ok: false as const, error: "Unauthorized" };
  }
  return { ok: true as const };
}
