import "server-only";
import { site } from "@/config/site";

/**
 * Returns your canonical site origin with no trailing slash.
 * Prefers NEXT_PUBLIC_SITE_URL / SITE_URL, then falls back to site.url.
 */
export function absBase(): string {
  const envBase =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    (typeof site?.url === "string" ? site.url.trim() : "");

  const cleaned = envBase.replace(/\/+$/, "");
  return cleaned || "http://127.0.0.1:3000";
}

/**
 * Build an absolute URL from a path ("/foo") or ("foo").
 */
export function absUrl(pathname: string): string {
  const base = absBase();
  const p = `/${String(pathname ?? "").trim().replace(/^\/+/, "")}`;
  return `${base}${p}`;
}

/**
 * If already absolute (http/https), return as-is.
 * If relative/path, convert to absolute using absBase().
 * If empty/null, fall back to a safe OG image path.
 */
export function absMaybe(urlOrPath: string | null | undefined): string {
  const s = String(urlOrPath ?? "").trim();
  if (!s) return absUrl("/og-image.png");
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  return absUrl(s.startsWith("/") ? s : `/${s}`);
}
