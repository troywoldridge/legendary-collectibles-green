import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/clerk_(.*)",
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
  "/api/shop(.*)",
  "/api/products(.*)",
  "/api/store(.*)",
  "/api/cart(.*)",
  "/api/checkout(.*)",
  "/api/stripe/checkout/start(.*)",
  "/api/stripe/checkout/sessions(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/robots.txt",
  "/sitemap.xml",
  "/sitemap(.*)",
  "/ping(.*)",
  "/api/webhooks/stripe",
]);

export default clerkMiddleware(async (auth, req: NextRequest) => {
  if (isPublicRoute(req)) return NextResponse.next();

  const { userId } = await auth();

  if (!userId) {
    const redirectPath = `${req.nextUrl.pathname}${req.nextUrl.search}`;

    const signInUrl = req.nextUrl.clone();
    signInUrl.pathname = "/sign-in";
    signInUrl.search = "";
    signInUrl.searchParams.set("redirect_url", redirectPath);

    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!.*\\..*|_next).*)",
    "/(api|trpc)(.*)",
  ],
};
