// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
   remotePatterns: [
      { protocol: 'https', hostname: 'imagedelivery.net', pathname: '/**' },
      { protocol: "https", hostname: "images.pokemontcg.io" },
      { protocol: "https", hostname: "c1.scryfall.com" },
      { protocol: "https", hostname: "cards.scryfall.io" },
      { protocol: "https", hostname: "assets.tcgdex.net" },
    ],
  },
  async redirects() {
    return [
      { source: "/vault", destination: "/search", permanent: true },
      { source: "/sets", destination: "/categories/pokemon/sets", permanent: true },
      { source: "/pokemon%20sets", destination: "/categories/pokemon/sets", permanent: true },
      { source: '/categories/magic', destination: '/categories/mtg', permanent: true },
      { source: '/categories/magic/:path*', destination: '/categories/mtg/:path*', permanent: true },

    ];
  },
};

export default nextConfig;
