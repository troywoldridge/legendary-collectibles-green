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
          // auth / user-only
           "/sign-in",
            "/sign-up",
            "/post-auth",
            "/collection",
            "/collection",
            "/account",
            "/dashboard",

          // internal / API / next internals
          "/api/",
          "/_next/",
          "/cdn-cgi/",

          // if you ever use these
          "/admin",
          "/admin/",
          "/api/dev/",
        ],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
