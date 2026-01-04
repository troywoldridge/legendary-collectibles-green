import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Public routes:
 * Anything NOT matched here is protected by Clerk.
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

export default clerkMiddleware(async (auth, req: NextRequest) => {
  if (isPublicRoute(req)) return NextResponse.next();
  await auth.protect();
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/", "/(api|trpc)(.*)"],
};
