// src/proxy.ts
import { NextResponse, type NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const CANONICAL_HOST = (process.env.CANONICAL_HOST ?? "").trim(); // e.g. "legendary-collectibles.com"

/** Remove any :port suffix, and lower-case it */
function stripPort(host: string) {
  return host.replace(/:\d+$/, "").toLowerCase();
}

/**
 * Prefer forwarded host/proto; fall back to Host / req.nextUrl.
 * Note: when behind Cloudflare Tunnel, you generally should NOT force HTTPS at the app layer.
 */
function getForwarded(req: NextRequest) {
  const xfHostRaw =
    req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const xfProtoRaw = req.headers.get("x-forwarded-proto") || "";

  const host = stripPort(xfHostRaw.split(",")[0].trim());

  const proto =
    (xfProtoRaw.split(",")[0].trim().toLowerCase() ||
      req.nextUrl.protocol.replace(":", "") ||
      "http") as "http" | "https";

  return { host, proto };
}

/** Local dev / LAN checks */
function isLocalHost(host: string) {
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.startsWith("192.168.") ||
    host.startsWith("10.") ||
    host.startsWith("172.")
  );
}

/**
 * Build a canonical https redirect URL based on current request path/query
 * but with:
 * - protocol forced to https
 * - hostname forced to canonical
 * - port ALWAYS cleared (prevents :3001 leaks)
 */
function buildCanonicalHttpsUrl(req: NextRequest, canonicalHost: string) {
  const url = req.nextUrl.clone();
  url.protocol = "https:";
  url.hostname = canonicalHost;
  url.port = ""; // ✅ strip internal port like :3001
  return url;
}

// Public routes that never require auth
const isPublicRoute = createRouteMatcher([
  "/",
  "/pricing(.*)",
  "/categories(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",

  // Public APIs
  "/api/dev/(.*)",
  "/api/webhooks/stripe",
  "/api/stripe/checkout/sessions(.*)",
  "/api/stripe/checkout/start",

  "/checkout/(.*)",
]);

export default clerkMiddleware(async (auth, req: NextRequest) => {
  const { host } = getForwarded(req);
  const local = isLocalHost(host);

  // ✅ Canonical host redirect only (safe for Cloudflare Tunnel)
  // We do NOT force HTTPS here — Cloudflare handles HTTPS at the edge.
  if (!local && CANONICAL_HOST) {
    const canonical = stripPort(CANONICAL_HOST);

    if (host && host !== canonical) {
      const url = buildCanonicalHttpsUrl(req, canonical);
      return NextResponse.redirect(url, 308);
    }
  }

  // Public routes
  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  // Auth gate
  const { userId } = await auth();
  if (!userId) {
    const returnTo = req.nextUrl.pathname + req.nextUrl.search;

    // Build sign-in URL using public host/proto (never localhost, never :3001)
    const baseProto = !local ? "https" : "http";
    const baseHost =
      !local && CANONICAL_HOST ? stripPort(CANONICAL_HOST) : host || "localhost";

    const signInUrl = new URL("/sign-in", `${baseProto}://${baseHost}`);
    signInUrl.searchParams.set("redirect_url", returnTo);

    return NextResponse.redirect(signInUrl, 302);
  }

  return NextResponse.next();
});

// Apply proxy to most routes, skip static assets
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|assets/|images/|public/|.*\\..*).*)",
    "/",
  ],
};
