// PG pool with keepAlive + exponential backoff around a single transactional unit.
import pg from "pg";

let pool;

function ts() { return new Date().toISOString(); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function getPool() {
  if (pool) return pool;
  const { Pool } = pg;
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.PG_POOL_MAX || 5),
    keepAlive: true,
    connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS || 15000),
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
    ssl: process.env.PG_SSL === "false" ? false : { rejectUnauthorized: false },
  });
  pool.on("error", (err) => {
    console.error(ts(), "PG-POOL error:", err);
  });
  return pool;
}

export async function withPg(txFn, { retries = 4 } = {}) {
  const pool = getPool();
  let attempt = 0;
  while (true) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Safe per-session settings; adjust to your needs
      await client.query("SET idle_in_transaction_session_timeout = '5min'");
      await client.query("SET lock_timeout = '30s'");
      const res = await txFn(client);
      await client.query("COMMIT");
      return res;
    } catch (err) {
      try { await client.query("ROLLBACK"); } catch {}
      attempt++;
      if (attempt > retries) throw err;
      const backoff = Math.min(30000, 1000 * 2 ** (attempt - 1));
      console.warn(ts(), `withPg(): attempt ${attempt}/${retries} failed: ${err.message}. Retrying in ${Math.round(backoff/1000)}s…`);
      await sleep(backoff);
    } finally {
      client.release();
    }
  }
}
