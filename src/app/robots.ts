// src/app/robots.ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const site =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
    "https://legendary-collectibles.com";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/sign-in",
          "/sign-up",
          "/post-auth",
          "/collection",
          "/account",
          "/dashboard",
          "/admin",
          "/checkout",
          "/cart/checkout",
        ],
      },

      // Optional AI crawler blocks (keep if you want)
      { userAgent: "GPTBot", allow: "/" },
      { userAgent: "ClaudeBot", disallow: "/" },
      { userAgent: "CCBot", disallow: "/" },
      { userAgent: "Bytespider", disallow: "/" },
    ],
    sitemap: `${site}/sitemap.xml`,
  };
}
