// src/app/robots.ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const site =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
    "https://legendary-collectibles.com";

  const protectedDisallow = [
    "/api/",
    "/sign-in",
    "/sign-up",
    "/sign-out",
    "/logout",
    "/post-auth",
    "/auth/",
    "/account",
    "/dashboard",
    "/admin",
    "/checkout",
    "/cart",
    "/_next/", // reduce noise crawling
  ];

  return {
    rules: [
      // 🖼 Google image crawler — REQUIRED for Merchant Center
      { userAgent: "Googlebot-Image", allow: "/" },

      // 🤖 AI crawler policy (your choice)
     // { userAgent: "GPTBot", allow: "/" },
     // { userAgent: "ClaudeBot", disallow: "/" },
     // { userAgent: "CCBot", disallow: "/" },
     // { userAgent: "Bytespider", disallow: "/" },

      // 🔎 Google main crawler — allow public pages, block protected
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: protectedDisallow,
      },

      // 🌐 Default rules for everyone else
      {
        userAgent: "*",
        allow: "/",
        disallow: protectedDisallow,
      },
    ],
    sitemap: `${site}/sitemap.xml`,
  };
}
