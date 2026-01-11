// src/middleware.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// ✅ Protect ONLY what must be protected (pages + APIs)
const isProtectedRoute = createRouteMatcher([
  // Pages
  "/cart(.*)",
  "/collection(.*)",

  // APIs
  "/api/cart(.*)",
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

    // Pages: redirect to sign-in with return url
    const redirectPath = `${req.nextUrl.pathname}${req.nextUrl.search}`;
    const signInUrl = req.nextUrl.clone();
    signInUrl.pathname = "/sign-in";
    signInUrl.search = "";
    signInUrl.searchParams.set("redirect_url", redirectPath);

    console.log("[AUTH] redirect", "ip=", ip, req.method, p, "-> /sign-in");
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)"],
};
