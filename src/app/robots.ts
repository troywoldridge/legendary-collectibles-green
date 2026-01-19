// src/app/robots.ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const site =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
    "https://legendary-collectibles.com";

  return {
    rules: [
      // 🔎 Google main crawler — MUST be allowed
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: [
          "/api/",
          "/sign-in",
          "/sign-up",
          "/sign-out",
          "/logout",
          "/post-auth",
          "/auth/",
          "/collection",
          "/account",
          "/dashboard",
          "/admin",
          "/checkout",
          "/cart",
        ],
      },

      // 🖼 Google image crawler — REQUIRED for Merchant Center
      {
        userAgent: "Googlebot-Image",
        allow: "/",
      },

      // 🌐 Default rules for everyone else
      {
        userAgent: "*",
        disallow: [
          "/api/",
          "/sign-in",
          "/sign-up",
          "/sign-out",
          "/logout",
          "/post-auth",
          "/auth/",
          "/collection",
          "/account",
          "/dashboard",
          "/admin",
          "/checkout",
          "/cart",
        ],
      },

      // 🤖 AI crawler policy (your choice)
      { userAgent: "GPTBot", allow: "/" },
      { userAgent: "ClaudeBot", disallow: "/" },
      { userAgent: "CCBot", disallow: "/" },
      { userAgent: "Bytespider", disallow: "/" },
    ],
    sitemap: `${site}/sitemap.xml`,
  };
}
