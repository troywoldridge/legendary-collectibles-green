/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  images: {
    remotePatterns: [
      // PokémonTCG.io CDN (set logos/symbols + card images if you use them)
      {
        protocol: "https",
        hostname: "images.pokemontcg.io",
        pathname: "/**",
      },

      // Cloudflare Images delivery
      {
        protocol: "https",
        hostname: "imagedelivery.net",
        pathname: "/**",
      },
    ],
  },
};

module.exports = nextConfig;
