// src/middleware.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Host normalization (Codex):
 * - Strips proxy-provided extras
 * - Normalizes IPv4 octets with leading zeros (e.g. 127.000.000.001 -> 127.0.0.1)
 * This prevents subtle host/header mismatches that can break absolute fetches, cookies, etc.
 */
function normalizeHost(host: string) {
  const cleaned = host.split(",")[0]?.trim() ?? host;
  const [hostname, port] = cleaned.split(":");
  const parts = hostname.split(".");

  if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
    const normalized = parts.map((p) => String(Number.parseInt(p, 10))).join(".");
    return port ? `${normalized}:${port}` : normalized;
  }

  return cleaned;
}

/**
 * Public routes (your original):
 * Anything not matched here is protected by Clerk.
 */
const isPublicRoute = createRouteMatcher([
  // Public pages
  "/",
  "/shop(.*)",
  "/products(.*)",
  "/categories(.*)",
  "/psa(.*)",
  "/guides(.*)",
  "/pricing(.*)",
  "/search(.*)",
  "/sets(.*)",
  "/vault(.*)",
  "/contact(.*)",
  "/faq(.*)",

  // Auth pages
  "/sign-in(.*)",
  "/sign-up(.*)",

  // SEO / simple routes
  "/robots.txt",
  "/sitemap.xml",
  "/sitemap(.*)",
  "/ping(.*)",

  // Guest shopping MUST work
  "/api/store(.*)",
  "/api/shop(.*)",
  "/api/cart(.*)",

  // Webhooks
  "/api/webhooks/stripe",
]);

export default clerkMiddleware(async (auth, req) => {
  // 1) Apply host normalization first
  const host = req.headers.get("host");
  if (host) {
    const normalizedHost = normalizeHost(host);
    if (normalizedHost !== host) {
      const headers = new Headers(req.headers);
      headers.set("host", normalizedHost);
      headers.set("x-forwarded-host", normalizedHost);

      // Preserve URL, just proceed with corrected headers
      const res = NextResponse.next({
        request: {
          headers,
        },
      });

      // Continue into auth logic by returning a Response is NOT possible here,
      // so we only return early if we are not protecting anything.
      // If the route is protected, we still need to protect it.
      if (isPublicRoute(req)) return res;

      // Protected route: run auth.protect() then return the header-fixed response.
      await auth.protect();
      return res;
    }
  }

  // 2) Original Clerk protection logic
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/", "/(api|trpc)(.*)"],
};
