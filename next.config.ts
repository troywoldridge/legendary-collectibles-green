// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Cloudflare Images delivery
      { protocol: "https", hostname: "imagedelivery.net", pathname: "/**" },

      // ✅ PokemonTCG images (required)
      { protocol: "https", hostname: "images.pokemontcg.io", pathname: "/**" },

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
    ];
  },

  async rewrites() {
    return [
      { source: "/sitemap-pages.xml", destination: "/sitemap-pages" },
    ];
  },
};

export default nextConfig;
