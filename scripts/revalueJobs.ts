// scripts/revalueJobs.mts
import "dotenv/config";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { revalueUserCollection } from "@/lib/valuations/revalueUserCollection";

type JobRow = { id: string; user_id: string };

async function claimNextJob(): Promise<JobRow | null> {
  return await db.transaction(async (tx) => {
    const found = await tx.execute<JobRow>(sql`
      SELECT id, user_id
      FROM user_revalue_jobs
      WHERE status = 'queued'
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `);

    const job = found.rows?.[0];
    if (!job) return null;

    await tx.execute(sql`
      UPDATE user_revalue_jobs
      SET status = 'running',
          started_at = now(),
          error = NULL
      WHERE id = ${job.id}
    `);

    return job;
  });
}

async function markDone(jobId: string) {
  await db.execute(sql`
    UPDATE user_revalue_jobs
    SET status = 'done',
        finished_at = now()
    WHERE id = ${jobId}
  `);
}

async function markFailed(jobId: string, err: unknown) {
  const msg =
    err instanceof Error
      ? err.stack ?? err.message
      : typeof err === "string"
      ? err
      : JSON.stringify(err);

  await db.execute(sql`
    UPDATE user_revalue_jobs
    SET status = 'failed',
        finished_at = now(),
        error = ${msg}
    WHERE id = ${jobId}
  `);
}

async function main() {
  const job = await claimNextJob();
  if (!job) {
    console.log("[revalueJobs] no queued jobs");
    return;
  }

  console.log(`[revalueJobs] running job ${job.id} for user ${job.user_id}`);

  try {
    const result = await revalueUserCollection(job.user_id);
    console.log("[revalueJobs] result:", result);
    await markDone(job.id);
  } catch (e) {
    console.error("[revalueJobs] failed:", e);
    await markFailed(job.id, e);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("[revalueJobs] fatal:", e);
  process.exitCode = 1;
});
