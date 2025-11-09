// src/app/admin/email-events/[id]/page.tsx
import "server-only";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { emailEvents } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

export default async function EmailEventDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const row =
    (
      await db
        .select()
        .from(emailEvents)
        .where(eq(emailEvents.id, Number(id)))
        .limit(1)
    )[0] || null;

  if (!row) {
    return (
      <section className="space-y-3">
        <h1 className="text-2xl font-bold text-white">Event not found</h1>
        <Link href="/admin/email-events" className="text-sky-300 hover:underline">
          ← Back to events
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Email Event #{row.id}</h1>
        <Link href="/admin/email-events" className="text-sky-300 hover:underline">
          ← All events
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
          <div className="mb-2 text-white/80">Summary</div>
          <dl className="grid grid-cols-3 gap-2">
            <dt className="text-white/60">Type</dt>
            <dd className="col-span-2 text-white">{row.eventType}</dd>

            <dt className="text-white/60">When</dt>
            <dd className="col-span-2 text-white">
              {row.occurredAt ? new Date(row.occurredAt).toLocaleString() : "—"}
            </dd>

            <dt className="text-white/60">Email ID</dt>
            <dd className="col-span-2 text-white">{row.emailId || "—"}</dd>

            <dt className="text-white/60">Subject</dt>
            <dd className="col-span-2 text-white">{row.subject || "—"}</dd>

            <dt className="text-white/60">From</dt>
            <dd className="col-span-2 text-white">{row.fromAddress || "—"}</dd>

            <dt className="text-white/60">To</dt>
            <dd className="col-span-2 text-white">{row.toCsv || "—"}</dd>

            <dt className="text-white/60">Message ID</dt>
            <dd className="col-span-2 text-white">{row.messageId || "—"}</dd>

            <dt className="text-white/60">Error</dt>
            <dd className="col-span-2 text-red-300">{row.errorMessage || "—"}</dd>
          </dl>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="mb-2 text-sm text-white/80">Raw payload</div>
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded bg-black/40 p-3 text-xs text-white/90">
            {JSON.stringify(row.raw, null, 2)}
          </pre>
        </div>
      </div>
    </section>
  );
}
