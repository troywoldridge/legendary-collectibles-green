// ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "adap-site",
      cwd: "/home/troy/apps/adap-site",
      script: "bash",
      args: "-lc 'pnpm start'",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },

    // ✅ PRODUCTION (domain / proxy) — port 3001
    {
      name: "legendary",
      cwd: "/home/troy/apps/legendary-collectibles-final",
      script: "bash",
      args: "-lc 'pnpm exec next start -p $PORT'",
      env: {
        NODE_ENV: "production",
        PORT: 3001,

        DATABASE_URL: process.env.DATABASE_URL,
        CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,

        // PROXY only for real domain traffic
        CLERK_PROXY_URL: "https://legendary-collectibles.com",
        NEXT_PUBLIC_CLERK_PROXY_URL: "https://legendary-collectibles.com",
        CLERK_TRUST_HOST: "true",

        NEXT_PUBLIC_APP_URL: "https://legendary-collectibles.com",

        NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/sign-in",
        NEXT_PUBLIC_CLERK_SIGN_UP_URL: "/sign-up",
        NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: "/collection",
        NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL: "/collection",
      },
    },

    // ✅ LOCAL TEST (no proxy) — port 3002
    {
      name: "legendary-local",
      cwd: "/home/troy/apps/legendary-collectibles-final",
      script: "bash",
      args: "-lc 'pnpm exec next start -p $PORT'",
      env: {
        NODE_ENV: "production",
        PORT: 3002,

        DATABASE_URL: process.env.DATABASE_URL,

        CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,

        // ✅ LOCAL: do NOT set proxy env vars
        NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3002",

        NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/sign-in",
        NEXT_PUBLIC_CLERK_SIGN_UP_URL: "/sign-up",
        NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: "/collection",
        NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL: "/collection",
      },
    },
  ],
};
