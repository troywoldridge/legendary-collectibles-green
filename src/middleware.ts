// src/middleware.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Protect ONLY what must be protected:
 * - Collection pages + APIs require auth
 * - Cart remains guest-safe
 */
const isProtectedRoute = createRouteMatcher(["/collection(.*)", "/api/collection(.*)"]);

/**
 * Always-public routes (never require auth, never get blocked).
 * Safe place for:
 * - Google Merchant feed
 * - robots/sitemaps
 * - crawler endpoints
 */
const isAlwaysPublicRoute = createRouteMatcher([
  "/google/merchant-feed(.*)",
  "/robots.txt",
  "/sitemap(.*)",
  "/sitemap.xml",
]);

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function isAuthPage(pathname: string) {
  return pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up") || pathname.startsWith("/post-auth");
}

/**
 * Ensure redirect_url is ALWAYS relative (never absolute).
 */
function sanitizeRedirectUrl(raw: string): string {
  const v = String(raw ?? "").trim();
  if (!v) return "/";

  if (/^https?:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      const host = (u.hostname || "").toLowerCase();
      if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) return "/";
      return `${u.pathname || "/"}${u.search || ""}`;
    } catch {
      return "/";
    }
  }

  return v.startsWith("/") ? v : `/${v}`;
}

/**
 * Skip Next internals + common static assets without relying on matcher regex.
 */
function shouldBypassMiddleware(pathname: string) {
  if (pathname.startsWith("/_next")) return true;
  if (pathname === "/favicon.ico") return true;

  // If it looks like a file request (has a dot), skip (except /api which should run)
  if (pathname.includes(".") && !pathname.startsWith("/api")) return true;

  return false;
}

function getAdminToken(req: NextRequest) {
  return (req.headers.get("x-admin-token") || req.headers.get("X-Admin-Token") || "").trim();
}

function hasValidAdminToken(req: NextRequest) {
  const want = (process.env.ADMIN_TOKEN || "").trim();
  if (!want) return false;
  const got = getAdminToken(req);
  return !!got && got === want;
}

function isNoisyHealthCheck(req: NextRequest) {
  const p = req.nextUrl.pathname;
  const ua = (req.headers.get("user-agent") || "").toLowerCase();

  // Cloudflare Traffic Manager / health checks
  if (p === "/api/health" && ua.includes("cloudflare-traffic-manager")) return true;

  return false;
}

export default clerkMiddleware(async (auth, req: NextRequest) => {
  const p = req.nextUrl.pathname;

  // ✅ Hard bypass for internals/assets
  if (shouldBypassMiddleware(p)) return NextResponse.next();

  // ✅ CRON BYPASS: cron routes do their own auth (x-cron-secret) inside the route handler.
  // This prevents Clerk middleware from interfering with /api/cron/*.
  if (p.startsWith("/api/cron/")) return NextResponse.next();

  // ✅ Absolute allowlist: never gate these, never redirect these
  if (isAlwaysPublicRoute(req)) return NextResponse.next();

  // ✅ Admin token bypass for protected routes (so curl can hit /api/collection/*)
  if (isProtectedRoute(req) && hasValidAdminToken(req)) {
    return NextResponse.next();
  }

  // Logging (only action-ish)
  const ip = getClientIp(req);
  const ua = req.headers.get("user-agent") || "";
  const ref = req.headers.get("referer") || "";
  const cfRay = req.headers.get("cf-ray") || "";
  const nextAction = req.headers.get("next-action") || "";

  const maybeAction =
    req.method === "POST" ||
    req.headers.get("content-type")?.includes("multipart/form-data") ||
    !!nextAction ||
    p.startsWith("/api") ||
    p.includes("action") ||
    p.startsWith("/product/") ||
    p.startsWith("/products/") ||
    p.startsWith("/store/");

  if (maybeAction && !isNoisyHealthCheck(req)) {
    console.log(
      "[REQ]",
      "ip=",
      ip,
      cfRay ? `cfRay=${cfRay}` : "",
      req.method,
      p,
      "ua=",
      ua.slice(0, 120),
      nextAction ? `next-action=${nextAction}` : "",
      "ref=",
      ref,
    );
  }

  // Strong crawler-proofing on auth pages
  if (isAuthPage(p)) {
    const res = NextResponse.next();
    res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
    return res;
  }

  // Public by default
  if (!isProtectedRoute(req)) return NextResponse.next();

  // Protected requires sign-in (unless admin token bypass above)
  const { userId } = await auth();

  if (!userId) {
    if (p.startsWith("/api")) {
      console.log("[AUTH] 401 api", "ip=", ip, req.method, p);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const redirectPath = `${req.nextUrl.pathname}${req.nextUrl.search}`;
    const signInUrl = req.nextUrl.clone();
    signInUrl.pathname = "/sign-in";
    signInUrl.search = "";
    signInUrl.searchParams.set("redirect_url", sanitizeRedirectUrl(redirectPath));

    console.log("[AUTH] redirect", "ip=", ip, req.method, p, "-> /sign-in");
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

/**
 * ✅ Simplest matcher possible (no regex / no lookaheads).
 * We do our own bypass logic above.
 */
export const config = {
  matcher: ["/:path*"],
};
