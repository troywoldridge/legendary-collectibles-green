// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
   remotePatterns: [
      { protocol: 'https', hostname: 'imagedelivery.net', pathname: '/**' },
      { protocol: "https", hostname: "images.pokemontcg.io" },
    ],
  },
  async redirects() {
    return [
      { source: "/vault", destination: "/search", permanent: true },
      { source: "/sets", destination: "/categories/pokemon/sets", permanent: true },
      { source: "/pokemon%20sets", destination: "/categories/pokemon/sets", permanent: true },
    ];
  },
};

export default nextConfig;
