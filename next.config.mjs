/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "imagedelivery.net", pathname: "/**" },
      { protocol: "https", hostname: "images.pokemontcg.io", pathname: "/**" },
    ],
  },
};

export default nextConfig;
