// src/middleware.ts
import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { getClerkMiddlewareConfig } from "@/lib/clerk/config";

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

const clerkEnv = getClerkMiddlewareConfig();

export default clerkMiddleware(
  {
    publishableKey: clerkEnv.publishableKey,
    secretKey: clerkEnv.secretKey,
    proxyUrl: clerkEnv.proxyUrl,
  },
  async (auth, req) => {
    if (isPublicRoute(req)) return NextResponse.next();

    await auth.protect();
  },
);

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/", "/(api|trpc)(.*)"],
};
