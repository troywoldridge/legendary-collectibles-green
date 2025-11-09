// src/middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const CANONICAL_HOST = process.env.CANONICAL_HOST ?? ""; // e.g. "legendary-collectibles.com"

// Public routes that never require auth
const isPublicRoute = createRouteMatcher([
  "/",
  "/pricing",
  "/categories(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/dev/(.*)",
  "/api/webhooks/stripe", // keep webhooks public
]);

export default clerkMiddleware(async (auth, req: NextRequest) => {
  const host = req.headers.get("host") || "";
  const isLocal =
    host.includes("127.0.0.1") ||
    host.startsWith("localhost") ||
    host.includes(":3000") ||
    host.includes(":3001");

  // --- Canonical host redirect (preserve full query string) ---
  if (!isLocal && CANONICAL_HOST && host !== CANONICAL_HOST) {
    const url = new URL(req.url);
    url.host = CANONICAL_HOST;      // keeps pathname + search + hash
    // url.protocol = "https:";      // uncomment if you want to force https
    return NextResponse.redirect(url, 308);
  }

  // --- Auth gating for non-public routes ---
  if (isPublicRoute(req)) return NextResponse.next();

  // Use userId instead of .protect() to avoid typing/version quirks
  const { userId } = await auth();
  if (!userId) {
    const signInUrl = new URL("/sign-in", req.url);
    signInUrl.searchParams.set("redirect_url", req.url);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

// Single, merged matcher (remove any other `export const config`)
export const config = {
  matcher: [
    // Run on all paths except:
    //  - Next internals: _next/*
    //  - Image optimizer: _next/image
    //  - Root public files: favicon/robots/sitemap
    //  - Any path that looks like a static file (has an extension)
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|assets/|images/|public/|.*\\..*).*)",
    "/", // also match the site root
  ],
};
