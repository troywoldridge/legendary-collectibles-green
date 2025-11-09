// src/lib/db/index.ts
import * as schema from "@/lib/db/schema";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

export type DB = NeonHttpDatabase<typeof schema> | NodePgDatabase<typeof schema>;

// HMR-safe global cache for Node runtime
declare global {
  // eslint-disable-next-line no-var
  var __DB__: DB | undefined;
}

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env: ${key}`);
  return v;
}

// Next/Edge detection
const isEdge = typeof (globalThis as any)?.EdgeRuntime !== "undefined";

let db: DB;

if (isEdge) {
  // Edge-safe: Neon HTTP driver (fetch-based)
  const { drizzle } = await import("drizzle-orm/neon-http");
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(requireEnv("DATABASE_URL"));
  db = drizzle(sql, { schema });
} else {
  // Full Node driver with connection pool; cache between HMR reloads
  if (!global.__DB__) {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: requireEnv("DATABASE_URL"),
      // If your provider needs SSL:
      ssl: process.env.PGSSL === "disable" ? undefined : { rejectUnauthorized: false },
    });
    global.__DB__ = drizzle(pool, { schema });
  }
  db = global.__DB__!;
}

export { db, schema };
