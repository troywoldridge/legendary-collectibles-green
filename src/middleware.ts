// src/middleware.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * ✅ Protect ONLY what must be protected.
 * Cart should be guest-safe (count/add/remove/view).
 * Collection is user-specific and should require auth.
 */
const isProtectedRoute = createRouteMatcher([
  // Pages
  "/collection(.*)",

  // APIs
  "/api/collection(.*)",
]);

function getClientIp(req: NextRequest): string {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf;

  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();

  const xrip = req.headers.get("x-real-ip");
  if (xrip) return xrip;

  return "unknown";
}

function isAuthPage(pathname: string) {
  return (
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/post-auth")
  );
}

/**
 * ✅ Ensure redirect_url is ALWAYS a relative path (never absolute).
 * - Converts "http(s)://host/path?x=y" -> "/path?x=y"
 * - Converts "localhost / 127.0.0.1" redirects -> "/"
 * - Ensures it starts with "/"
 */
function sanitizeRedirectUrl(raw: string, req: NextRequest): string {
  const v = String(raw ?? "").trim();
  if (!v) return "/";

  // If absolute URL, strip to path+query
  if (/^https?:\/\//i.test(v)) {
    try {
      const u = new URL(v);

      // If it's explicitly localhost-ish, just go home.
      const host = (u.hostname || "").toLowerCase();
      if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) {
        return "/";
      }

      const path = u.pathname || "/";
      const qs = u.search || "";
      return `${path.startsWith("/") ? path : `/${path}`}${qs}`;
    } catch {
      return "/";
    }
  }

  // If already relative, ensure it starts with "/"
  if (!v.startsWith("/")) return `/${v}`;
  return v;
}

export default clerkMiddleware(async (auth, req: NextRequest) => {
  const p = req.nextUrl.pathname;

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
    p.startsWith("/store/") ||
    p === "/robots.txt" ||
    p.startsWith("/sitemap");

  if (maybeAction) {
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

  // ✅ Extra: set a strong noindex header on auth utility pages
  // (metadata is good, but this header is even more crawler-proof)
  if (isAuthPage(p)) {
    const res = NextResponse.next();
    res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
    return res;
  }

  // ✅ Public by default
  if (!isProtectedRoute(req)) return NextResponse.next();

  // ✅ Protected routes require sign-in
  const { userId } = await auth();

  if (!userId) {
    // APIs: return JSON 401 (never redirect)
    if (p.startsWith("/api")) {
      console.log("[AUTH] 401 api", "ip=", ip, req.method, p);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Pages: redirect to sign-in with return url (sanitized)
    const redirectPath = `${req.nextUrl.pathname}${req.nextUrl.search}`;
    const signInUrl = req.nextUrl.clone();
    signInUrl.pathname = "/sign-in";
    signInUrl.search = "";

    // ✅ Always relative, never absolute
    signInUrl.searchParams.set("redirect_url", sanitizeRedirectUrl(redirectPath, req));

    console.log("[AUTH] redirect", "ip=", ip, req.method, p, "-> /sign-in");
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)"],
};
