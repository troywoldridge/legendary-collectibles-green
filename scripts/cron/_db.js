/* scripts/cron/_db.js */
import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';

// Pick up your Neon string. Adjust if you use a different var name.
const CONN =
  process.env.DATABASE_URL ||
  process.env.NEON_DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_CONNECTION_STRING;

if (!CONN) {
  console.error('DATABASE_URL (or NEON_DATABASE_URL/POSTGRES_URL) is missing.');
  process.exit(1);
}

// Neon usually requires SSL. If your URL already has sslmode=require, this is harmless.
const pool = new Pool({
  connectionString: CONN,
  ssl: { rejectUnauthorized: false },
});

export const db = drizzle(pool);
export { sql };
