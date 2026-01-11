// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Cloudflare Images delivery
      { protocol: "https", hostname: "imagedelivery.net", pathname: "/**" },

      // ✅ PokemonTCG images (required)
      { protocol: "https", hostname: "images.pokemontcg.io", pathname: "/**" },

      // ✅ YGOPRODeck (Yu-Gi-Oh images)
      { protocol: "https", hostname: "images.ygoprodeck.com", pathname: "/**" },

      // Scryfall
      { protocol: "https", hostname: "c1.scryfall.com", pathname: "/**" },
      { protocol: "https", hostname: "cards.scryfall.io", pathname: "/**" },

      // TCGdex
      { protocol: "https", hostname: "assets.tcgdex.net", pathname: "/**" },
    ],
  },

  async redirects() {
  return [
    { source: "/vault", destination: "/search", permanent: true },
    { source: "/sets", destination: "/categories/pokemon/sets", permanent: true },
    { source: "/pokemon%20sets", destination: "/categories/pokemon/sets", permanent: true },
    { source: "/categories/magic", destination: "/categories/mtg", permanent: true },
    { source: "/categories/magic/:path*", destination: "/categories/mtg/:path*", permanent: true },

    // Legacy /store → /shop
    { source: "/store", destination: "/shop", permanent: true },
    { source: "/store/:game", destination: "/shop/:game", permanent: true },
    { source: "/store/listing/:id", destination: "/shop", permanent: true },
  ];
},


  async rewrites() {
    return [{ source: "/sitemap-pages.xml", destination: "/sitemap-pages" }];
  },

  // ✅ Ensure crawlers & Search Console always see the latest robots/sitemaps
  async headers() {
    const noCache = "no-store, max-age=0";

    const noCachePaths = [
      "/robots.txt",

      "/sitemap.xml",

      "/sitemap-pokemon.xml",
      "/sitemap-pokemon-1.xml",
      "/sitemap-pokemon-2.xml",

      "/sitemap-ygo.xml",

      "/sitemap-mtg-1.xml",
      "/sitemap-mtg-2.xml",
      "/sitemap-mtg-3.xml",
      "/sitemap-mtg-4.xml",
      "/sitemap-mtg-5.xml",
    ];

    return noCachePaths.map((source) => ({
      source,
      headers: [{ key: "Cache-Control", value: noCache }],
    }));
  },
};

export default nextConfig;
