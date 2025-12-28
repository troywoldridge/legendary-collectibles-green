// scripts/revalueJobs.mjs
import "dotenv/config";
import pg from "pg";
import { request } from "undici";

const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL in env");
  process.exit(1);
}

// Try multiple origins automatically (IPv4 + localhost)
const ORIGINS = [
  process.env.REVALUE_ORIGIN,
  "http://127.0.0.1:3001",
  "http://localhost:3001",
].filter(Boolean);

function cleanToken(raw) {
  const s = String(raw ?? "")
    // strip ANSI escape codes (pm2 sometimes injects color codes)
    .replace(/\x1B\[[0-9;]*[mK]/g, "")
    // remove CR/LF/tab/space
    .replace(/[\r\n\t ]+/g, "")
    .trim();

  // your token is hex (from what we've seen). Keep only hex chars.
  const hex = s.replace(/[^0-9a-fA-F]/g, "");
  return hex;
}

const ADMIN_API_TOKEN = cleanToken(process.env.ADMIN_API_TOKEN);

if (!ADMIN_API_TOKEN) {
  console.error("Missing ADMIN_API_TOKEN in env");
  process.exit(1);
}

// Optional: sanity check expected length (yours looked like 74 earlier in PM2 env output)
if (ADMIN_API_TOKEN.length < 32) {
  console.error(`ADMIN_API_TOKEN looks too short (len=${ADMIN_API_TOKEN.length})`);
  process.exit(1);
}


if (!ADMIN_API_TOKEN) {
  console.error("Missing ADMIN_API_TOKEN in env");
  process.exit(1);
}

console.log("[revalueJobs] admin token len:", ADMIN_API_TOKEN.length);


async function requestWithRetry(
  url,
  { method = "GET", headers = {}, body = undefined } = {},
  { attempts = 3, timeoutMs = 120000 } = {}
) {
  let lastErr = null;

  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await request(url, {
        method,
        headers,
        body,
        headersTimeout: timeoutMs,
        bodyTimeout: timeoutMs,
      });

      const text = await res.body.text();
      const ok = res.statusCode >= 200 && res.statusCode < 300;

      return { status: res.statusCode, ok, text };
    } catch (e) {
      lastErr = e;
      // basic backoff
      await new Promise((r) => setTimeout(r, 400 * i));
    }
  }

  throw lastErr ?? new Error("request failed");
}

async function callInternalRevalue(userId) {
  const path = "/api/internal/revalue-user";
  const body = JSON.stringify({ userId });

  let lastError = null;

  for (const origin of ORIGINS) {
    const url = `${origin}${path}`;
    console.log(`[revalueJobs] calling ${url}`);

    try {
      const res = await requestWithRetry(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-token": ADMIN_API_TOKEN,
          },
          body,
        },
        { attempts: 3, timeoutMs: 10 * 60 * 1000 } // allow long revalue
      );

      let json = null;
      try {
        json = JSON.parse(res.text);
      } catch {
        // keep json as null; res.text still contains the body
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} from ${url}: ${res.text}`);
      }

      return json;
    } catch (e) {
      lastError = e;
      console.log(
        `[revalueJobs] failed on ${origin}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  throw lastError ?? new Error("all origins failed");
}

async function main() {
  console.log("[revalueJobs] origins:", ORIGINS.join(", "));

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  let job = null;

  try {
    // Claim one queued job (atomic)
    await client.query("BEGIN");

    const found = await client.query(`
      SELECT id, user_id
      FROM user_revalue_jobs
      WHERE status = 'queued'
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `);

    if (found.rows.length === 0) {
      await client.query("ROLLBACK");
      console.log("[revalueJobs] no queued jobs");
      return;
    }

    job = found.rows[0];

    await client.query(
      `
      UPDATE user_revalue_jobs
      SET status='running', started_at=now(), error=NULL
      WHERE id=$1
      `,
      [job.id]
    );

    await client.query("COMMIT");

    console.log(`[revalueJobs] running job ${job.id} for user ${job.user_id}`);

    const result = await callInternalRevalue(job.user_id);

    console.log("[revalueJobs] result:", result);

    await client.query(
      `
      UPDATE user_revalue_jobs
      SET status='done', finished_at=now()
      WHERE id=$1
      `,
      [job.id]
    );
  } catch (err) {
    const msg = err instanceof Error ? err.stack || err.message : String(err);
    console.error("[revalueJobs] failed:", msg);

    if (job?.id) {
      try {
        await client.query(
          `
          UPDATE user_revalue_jobs
          SET status='failed', finished_at=now(), error=$2
          WHERE id=$1
          `,
          [job.id, msg]
        );
      } catch {
        // best-effort
      }
    }

    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
