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
        PORT: "3000",
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
        PORT: "3001",

        // ---- Core ----
        DATABASE_URL: process.env.DATABASE_URL,

        // ---- Clerk ----
        CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
          process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,

        // PROXY only for real domain traffic
        CLERK_PROXY_URL: "https://legendary-collectibles.com",
        NEXT_PUBLIC_CLERK_PROXY_URL: "https://legendary-collectibles.com",
        CLERK_TRUST_HOST: "true",

        NEXT_PUBLIC_APP_URL: "https://legendary-collectibles.com",
        SITE_URL: "https://legendary-collectibles.com",
        NEXT_PUBLIC_SITE_URL: "https://legendary-collectibles.com",

        NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/sign-in",
        NEXT_PUBLIC_CLERK_SIGN_UP_URL: "/sign-up",
        NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: "/collection",
        NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL: "/collection",

        // ---- Stripe ----
        STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
        STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,

        // ---- Resend (sale alerts) ----
        RESEND_API_KEY: process.env.RESEND_API_KEY,
        SALES_NOTIFY_EMAIL_TO: process.env.SALES_NOTIFY_EMAIL_TO,
        SALES_NOTIFY_EMAIL_FROM:
          process.env.SALES_NOTIFY_EMAIL_FROM ||
          "Legendary Collectibles <sales@legendary-collectibles.com>",

        // ---- Discord ----
        DISCORD_SALES_WEBHOOK_URL: process.env.DISCORD_SALES_WEBHOOK_URL,

        // --- Admin Emails ---
        ADMIN_EMAILS: process.env.ADMIN_EMAILS,

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
        PORT: "3002",

        DATABASE_URL: process.env.DATABASE_URL,

        // ---- Clerk ----
        CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
          process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,

        // ✅ LOCAL: do NOT set proxy env vars
        NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3002",
        SITE_URL: "http://127.0.0.1:3002",
        NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3002",

        NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/sign-in",
        NEXT_PUBLIC_CLERK_SIGN_UP_URL: "/sign-up",
        NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: "/collection",
        NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL: "/collection",

        // ---- Stripe ----
        STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
        STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,

        // ---- Resend (sale alerts) ----
        RESEND_API_KEY: process.env.RESEND_API_KEY,
        SALES_NOTIFY_EMAIL_TO: process.env.SALES_NOTIFY_EMAIL_TO,
        SALES_NOTIFY_EMAIL_FROM:
          process.env.SALES_NOTIFY_EMAIL_FROM ||
          "Legendary Collectibles <sales@legendary-collectibles.com>",

        // ---- Discord ---
        DISCORD_SALES_WEBHOOK_URL: process.env.DISCORD_SALES_WEBHOOK_URL,

        // --- Admin Emails ---
        ADMIN_EMAILS: process.env.ADMIN_EMAILS,

      },
    },
  ],
};
