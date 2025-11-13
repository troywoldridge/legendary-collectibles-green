// src/middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const CANONICAL_HOST = process.env.CANONICAL_HOST ?? ""; // e.g. "legendary-collectibles.com";

// Public routes that never require auth
const isPublicRoute = createRouteMatcher([
  "/",                    // home
  "/pricing(.*)",             // pricing page
  "/categories(.*)",      // all category pages
  "/sign-in(.*)",
  "/sign-up(.*)",

  // API routes that must stay public
  "/api/dev/(.*)",
  "/api/webhooks/stripe",
  "/api/stripe/checkout/sessions(.*)",
  "/api/stripe/checkout/start",

  // Checkout result pages (Stripe redirects here with ?sid=...)
  "/checkout/(.*)",
]);

export default clerkMiddleware(async (auth, req: NextRequest) => {
  const host = req.headers.get("host") || "";
  const isLocal =
    host.includes("127.0.0.1") ||
    host.startsWith("localhost") ||
    host.includes(":3000") ||
    host.includes(":3001");

  // --- Canonical host redirect (preserve full URL: path + query + hash) ---
  if (!isLocal && CANONICAL_HOST && host !== CANONICAL_HOST) {
    const url = req.nextUrl.clone(); // clone keeps pathname + search + hash
    url.host = CANONICAL_HOST;
    // url.protocol = "https:"; // uncomment if you explicitly want https
    return NextResponse.redirect(url, 308);
  }

  // --- Allow all public routes straight through ---
  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  // --- Auth gating for everything else ---
  const { userId } = await auth();

  if (!userId) {
    // send them to sign-in, then back where they were
    const signInUrl = req.nextUrl.clone();
    signInUrl.pathname = "/sign-in";
    signInUrl.searchParams.set("redirect_url", req.nextUrl.toString());
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

// Apply middleware to most routes, but skip static assets and Next internals
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
