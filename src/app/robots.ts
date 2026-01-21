// src/app/robots.ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const site =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
    "https://legendary-collectibles.com";

  // Block sensitive/private/non-indexable areas for ALL bots (including "good" ones)
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
    "/_next/", // reduce crawl noise
  ];

  // Optionally block utility/no-value pages if you have them
  // const lowValueDisallow = ["/search"]; // example if you ever want it

  return {
    rules: [
      // ✅ Merchant Center / image indexing: allow image crawler
      { userAgent: "Googlebot-Image", allow: "/" },

      // ✅ Google main crawler: allow site, block protected
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: protectedDisallow,
      },

      // ✅ Bing (and many others) respect this
      {
        userAgent: "Bingbot",
        allow: "/",
        disallow: protectedDisallow,
      },

      // ✅ Moz (SEO tools / link crawlers)
      // Moz’s crawlers include names like: DotBot, Moz, rogerbot, etc.
      {
        userAgent: "DotBot",
        allow: "/",
        disallow: protectedDisallow,
      },
      {
        userAgent: "rogerbot",
        allow: "/",
        disallow: protectedDisallow,
      },

      // ✅ Amazon-associated crawlers can show up under different names.
      // Commonly seen: Amazonbot (plus others). We'll treat them like "good": allow public pages only.
      {
        userAgent: "Amazonbot",
        allow: "/",
        disallow: protectedDisallow,
      },

      // ✅ Meta / Facebook link preview
      {
        userAgent: "facebookexternalhit",
        allow: "/",
        disallow: protectedDisallow,
      },

      // ✅ Twitter/X link preview
      {
        userAgent: "Twitterbot",
        allow: "/",
        disallow: protectedDisallow,
      },

      // ✅ Slack / Discord previews
      {
        userAgent: "Slackbot-LinkExpanding",
        allow: "/",
        disallow: protectedDisallow,
      },
      {
        userAgent: "Discordbot",
        allow: "/",
        disallow: protectedDisallow,
      },

      // 🚫 AI training crawlers (your choice)
      // These are not "good bots" for SEO and can create load.
      { userAgent: "GPTBot", disallow: "/" },
      { userAgent: "ClaudeBot", disallow: "/" },
      { userAgent: "CCBot", disallow: "/" },
      { userAgent: "Bytespider", disallow: "/" },

      // 🌐 Default: allow public pages, block protected
      {
        userAgent: "*",
        allow: "/",
        disallow: protectedDisallow,
      },
    ],
    sitemap: `${site}/sitemap.xml`,
  };
}
