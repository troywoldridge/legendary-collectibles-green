import * as schema from "@/lib/db/schema";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

type DB = NeonHttpDatabase<typeof schema> | NodePgDatabase<typeof schema>;
let db: DB;

// Next.js sets a global in Edge runtime
const isEdge = (globalThis as any)?.EdgeRuntime === "edge-runtime";

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env: ${key}`);
  return v;
}

if (isEdge) {
  // Edge-safe Neon HTTP driver
  const { drizzle } = await import("drizzle-orm/neon-http");
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(requireEnv("DATABASE_URL"));
  db = drizzle(sql, { schema });
} else {
  // Full Node driver
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString: requireEnv("DATABASE_URL"),
    ssl: process.env.PGSSL === "disable" ? undefined : { rejectUnauthorized: false },
  });
  db = drizzle(pool, { schema });
}

export { db };
