// src/lib/db.ts
import "server-only";

import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

const { Pool } = pg;

// Lazily initialized singletons (important for Next build + dev reloads)
let _pool: pg.Pool | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

function getDatabaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
}

export function getPool() {
  if (_pool) return _pool;

  const url = getDatabaseUrl();
  if (!url) {
    // Don’t throw at import time — only when actually used
    throw new Error("DATABASE_URL is not set");
  }

  _pool = new Pool({
    connectionString: url,
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  });

  return _pool;
}

export function getDb() {
  if (_db) return _db;
  const pool = getPool();

  // If you have a schema barrel, you can pass it here:
  //   import * as schema from "@/lib/db/schema";
  //   _db = drizzle(pool, { schema });
  //
  // But leaving schema out is fine if you're using raw sql`` or table objects in routes.
  _db = drizzle(pool);

  return _db;
}

// Default export used everywhere in your app:
export const db = new Proxy(
  {},
  {
    get(_target, prop) {
      const real = getDb() as any;
      return real[prop];
    },
  },
) as ReturnType<typeof drizzle>;
