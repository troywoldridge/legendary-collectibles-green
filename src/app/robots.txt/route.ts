// src/app/robots.txt/route.ts
import "server-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const body = [
    "User-agent: Googlebot",
    "Allow: /",
    "",
    "User-agent: Google-Extended",
    "Allow: /",
    "",
    "User-agent: *",
    "Allow: /",
    "Disallow: /sign-in",
    "Disallow: /sign-up",
    "Disallow: /post-auth",
    "Disallow: /collection",
    "Disallow: /account",
    "Disallow: /dashboard",
    "Disallow: /admin",
    "Disallow: /api",
    "Disallow: /api/dev",
    "Disallow: /_next",
    "Disallow: /cdn-cgi",
    "",
    "User-agent: GPTBot",
    "Disallow: /",
    "",
    "User-agent: ClaudeBot",
    "Disallow: /",
    "",
    "User-agent: CCBot",
    "Disallow: /",
    "",
    "User-agent: Bytespider",
    "Disallow: /",
    "",
    "Sitemap: https://legendary-collectibles.com/sitemap.xml",
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // prevent Cloudflare from serving stale/rewritten robots
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
