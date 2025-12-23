                             
module.exports = {
  apps: [
    {
      name: "adap-site",
      cwd: "/home/troy/apps/adap-site",
      script: "pnpm",
      args: "start",
      env: {
        NODE_ENV: "production",
        PORT: 3000
      }
    },
{
  name: "legendary",
  cwd: "/home/troy/apps/legendary-collectibles-final",
  script: "pnpm",
  args: "start",
  env: {
    NODE_ENV: "production",
    PORT: 3001,

    DATABASE_URL: "postgres://troywoldridge:YOUR_PASSWORD@localhost:5432/legendary",

    CLERK_PROXY_URL: "https://legendary-collectibles.com",
    NEXT_PUBLIC_CLERK_PROXY_URL: "https://legendary-collectibles.com",
    CLERK_TRUST_HOST: "true",

    NEXT_PUBLIC_APP_URL: "https://legendary-collectibles.com"
  }
}       
  ]
};
