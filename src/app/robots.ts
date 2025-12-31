// src/app/robots.ts
import type { MetadataRoute } from "next";
import { site } from "@/config/site";

const BASE = (site?.url ?? "https://legendary-collectibles.com").replace(/\/+$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/sign-in",
          "/sign-up",
          "/post-auth",
          "/collection",
          "/account",
          "/dashboard",
          "/api/",
          "/_next/",
          "/cdn-cgi/",
          "/admin",
          "/admin/",
          "/api/dev/",
        ],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    // ✅ don't output Host:
  };
}
