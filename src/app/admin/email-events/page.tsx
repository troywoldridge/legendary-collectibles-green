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
  searchParams: SP;
}) {
  const sp = searchParams;
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
  if (to)   where.push(lte(emailEvents.occurredAt, new Date(to)));

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

      {/* Filters */}
      <form className="grid gap-3 rounded-xl border border-white/10 bg-white/5 p-3 md:grid-cols-5">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search subject, to, from, ids..."
          className="col-span-2 rounded-md bg-black/30 px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10"
        />
        <select
          name="type"
          defaultValue={type}
          className="rounded-md bg-black/30 px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10"
        >
          {types.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <input
          type="date"
          name="from"
          defaultValue={from}
          className="rounded-md bg-black/30 px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10"
        />
        <input
          type="date"
          name="to"
          defaultValue={to}
          className="rounded-md bg-black/30 px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10"
        />

        <div className="md:col-span-5 flex justify-end gap-2">
          <a
            href={mkQuery({ q: "", type: "all", from: "", to: "", page: 1 })}
            className="rounded bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20"
          >
            Reset
          </a>
          <button
            type="submit"
            className="rounded bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-500"
          >
            Apply
          </button>
        </div>
      </form>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="min-w-full text-sm">
          <thead className="bg-white/10 text-white/80">
            <tr>
              <th className="px-3 py-2 text-left">When</th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">Subject</th>
              <th className="px-3 py-2 text-left">To</th>
              <th className="px-3 py-2 text-left">From</th>
              <th className="px-3 py-2 text-left">Email ID</th>
              <th className="px-3 py-2 text-left">Error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-white/5">
                <td className="px-3 py-2 text-white/90">
                  <Link href={`/admin/email-events/${r.id}`} className="hover:underline">
                    {r.occurredAt ? new Date(r.occurredAt).toLocaleString() : "—"}
                  </Link>
                </td>
                <td className="px-3 py-2 text-white">{r.eventType}</td>
                <td className="px-3 py-2 text-white">{r.subject || "—"}</td>
                <td className="px-3 py-2 text-white/90">{r.toCsv || "—"}</td>
                <td className="px-3 py-2 text-white/70">{r.fromAddress || "—"}</td>
                <td className="px-3 py-2 text-white/80">{r.emailId || "—"}</td>
                <td className="px-3 py-2 text-red-300">{r.errorMessage || ""}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-white/60">
                  No events match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-white/70">
        <div>
          Page <span className="text-white">{page}</span> / {totalPages} •{" "}
          Total <span className="text-white">{count}</span>
        </div>
        <div className="flex gap-2">
          <a
            aria-disabled={page <= 1}
            className={`rounded px-3 py-1.5 ${page <= 1 ? "pointer-events-none bg-white/10 text-white/40" : "bg-white/10 hover:bg-white/20 text-white"}`}
            href={mkQuery({ page: Math.max(1, page - 1) })}
          >
            ← Prev
          </a>
          <a
            aria-disabled={page >= totalPages}
            className={`rounded px-3 py-1.5 ${page >= totalPages ? "pointer-events-none bg-white/10 text-white/40" : "bg-white/10 hover:bg-white/20 text-white"}`}
            href={mkQuery({ page: Math.min(totalPages, page + 1) })}
          >
            Next →
          </a>
        </div>
      </div>
    </section>
  );
}
