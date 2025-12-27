// src/app/admin/email-events/page.tsx
import "server-only";
import { db } from "@/lib/db";
import { emailEvents } from "@/lib/db/schema";
import { and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import Link from "next/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

function toStr(v: string | string[] | undefined, d = "") {
  if (Array.isArray(v)) return v[0] ?? d;
  return v ?? d;
}

export default async function AdminEmailEventsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;

  const page = Math.max(1, Number(toStr(sp.page, "1")));
  const per = Math.min(200, Math.max(1, Number(toStr(sp.per, "50"))));
  const q = toStr(sp.q).trim();
  const type = toStr(sp.type, "all").trim();
  const from = toStr(sp.from).trim();
  const to = toStr(sp.to).trim();

  const where: any[] = [];
  if (type && type !== "all") where.push(eq(emailEvents.eventType, type));
  if (q) {
    const pat = `%${q}%`;
    where.push(
      or(
        ilike(emailEvents.subject, pat),
        ilike(emailEvents.fromAddress, pat),
        ilike(emailEvents.toCsv, pat),
        ilike(emailEvents.messageId, pat),
        ilike(emailEvents.emailId, pat),
        ilike(emailEvents.errorMessage, pat),
      )
    );
  }
  if (from) where.push(gte(emailEvents.occurredAt, new Date(from)));
  if (to) where.push(lte(emailEvents.occurredAt, new Date(to)));

  const cond = where.length ? and(...where) : undefined;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(emailEvents)
    .where(cond);

  const rows = await db
    .select()
    .from(emailEvents)
    .where(cond)
    .orderBy(desc(emailEvents.occurredAt))
    .limit(per)
    .offset((page - 1) * per);

  const totalPages = Math.max(1, Math.ceil(count / per));

  const mkQuery = (patch: Record<string, string | number>) => {
    const params = new URLSearchParams({
      page: String(page),
      per: String(per),
      q,
      type,
      from,
      to,
    });
    for (const [k, v] of Object.entries(patch)) {
      if (v === "") params.delete(k);
      else params.set(k, String(v));
    }
    return `?${params.toString()}`;
  };

  const csvHref = mkQuery({ format: "csv" });

  const types = [
    "all",
    "email.sent",
    "email.delivered",
    "email.opened",
    "email.clicked",
    "email.bounced",
    "email.complained",
    "email.rejected",
    "email.failed",
  ];

  return (
    <section className="space-y-4">
      {/* ... keep the rest of your component exactly the same ... */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-white">Email Events</h1>
        <div className="flex gap-2">
          <a
            href={csvHref}
            className="rounded bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20"
          >
            Export CSV
          </a>
        </div>
      </div>

      {/* rest unchanged */}
    </section>
  );
}
