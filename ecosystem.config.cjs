module.exports = {
  apps: [
    {
      name: "legendary-blue",
      cwd: "/home/troy/apps/legendary-collectibles-final", // <-- your current prod folder (adjust if different)
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3001",
      env: { NODE_ENV: "production" },
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "1G",
    },
    {
      name: "legendary-green",
      cwd: "/home/troy/apps/legendary-collectibles-final.clean", // <-- candidate folder
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3002",
      env: { NODE_ENV: "production" },
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "1G",
    },
  ],
};
