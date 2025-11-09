// src/middleware.ts
import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const CANONICAL_HOST = process.env.CANONICAL_HOST ?? ""; // e.g. "legendary-collectibles.com"

// Public routes (let them through the middleware)
const isPublicRoute = createRouteMatcher([
  "/",
  "/pricing",
  "/categories(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/dev/(.*)",
  "/api/webhooks/stripe",
  "/api/ebay/(.*)", // <-- your eBay endpoints must be reachable by the cron
]);

export default clerkMiddleware(async (auth, req) => {
  const host = req.headers.get("host") || "";
  const isLocal =
    host.includes("127.0.0.1") ||
    host.startsWith("localhost") ||
    host.includes(":300");

  // Allow requests with a valid cron key to pass (for server-to-server jobs)
  const cronKey = req.headers.get("x-cron-key") || "";
  const cronOk = !!process.env.CRON_SECRET && cronKey === process.env.CRON_SECRET;

  // Public or cron-authenticated requests skip auth
  if (isPublicRoute(req) || cronOk) {
    // optional canonical redirect for HTML navigations
    if (!isLocal && CANONICAL_HOST && host !== CANONICAL_HOST) {
      if (req.method === "GET" && req.headers.get("accept")?.includes("text/html")) {
        const url = req.nextUrl.clone();
        url.host = CANONICAL_HOST;
        return NextResponse.redirect(url, 301);
      }
    }
    return NextResponse.next();
  }

  // Private route: resolve the session and redirect to sign-in if unauthenticated
  const session = await auth();
  if (!session.userId) {
    return session.redirectToSignIn();
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/"],
};
