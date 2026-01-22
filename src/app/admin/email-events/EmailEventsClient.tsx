"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type EmailEventRow = {
  id: string;
  provider: string;
  eventType: string;
  eventId: string | null;
  emailId: string | null;
  messageId: string | null;
  subject: string | null;
  fromAddress: string | null;
  toCsv: string | null;
  occurredAt: string | null;
  clickLink: string | null;
  clickTimestamp: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
};

function fmtTs(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString();
}

function short(v: string | null, n = 42) {
  if (!v) return "—";
  const s = String(v);
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

const COMMON_TYPES = [
  "email.sent",
  "email.delivered",
  "email.bounced",
  "email.complained",
  "email.opened",
  "email.clicked",
];

export default function EmailEventsClient() {
  const [q, setQ] = useState("");
  const [provider, setProvider] = useState<string>(""); // blank = all
  const [type, setType] = useState<string>(""); // blank = all
  const [rows, setRows] = useState<EmailEventRow[]>([]);
  const [limit] = useState(25);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canNext = useMemo(() => rows.length === limit, [rows, limit]);

  async function load(nextOffset = 0) {
    setLoading(true);
    setErr(null);
    try {
      const url = new URL("/api/admin/email-events", window.location.origin);
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("offset", String(nextOffset));
      if (q.trim()) url.searchParams.set("q", q.trim());
      if (provider) url.searchParams.set("provider", provider);
      if (type) url.searchParams.set("type", type);

      const r = await fetch(url.toString(), { cache: "no-store" });
      const j = await r.json();

      if (!j?.ok) throw new Error(j?.message || "Failed to load email events");
      setRows(j.rows || []);
      setOffset(nextOffset);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search id, subject, to, messageId, emailId, error…"
          className="w-full rounded-md bg-black/20 border border-white/10 px-3 py-2"
        />

        <div className="flex flex-wrap gap-2">
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="rounded-md bg-black/20 border border-white/10 px-3 py-2"
          >
            <option value="">All providers</option>
            <option value="resend">resend</option>
          </select>

          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-md bg-black/20 border border-white/10 px-3 py-2"
          >
            <option value="">All types</option>
            {COMMON_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <button
            onClick={() => load(0)}
            className="rounded-md border border-white/10 px-3 py-2 hover:bg-white/10"
            disabled={loading}
          >
            {loading ? "Loading…" : "Search"}
          </button>

          <button
            onClick={() => load(Math.max(0, offset - limit))}
            className="rounded-md border border-white/10 px-3 py-2 hover:bg-white/10"
            disabled={loading || offset === 0}
          >
            Prev
          </button>

          <button
            onClick={() => load(offset + limit)}
            className="rounded-md border border-white/10 px-3 py-2 hover:bg-white/10"
            disabled={loading || !canNext}
          >
            Next
          </button>
        </div>
      </div>

      {err ? <p className="mt-3 text-sm text-red-300">{err}</p> : null}

      <div className="mt-4 overflow-auto rounded-lg border border-white/10">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-black/40 backdrop-blur">
            <tr className="text-left">
              <th className="p-2">When</th>
              <th className="p-2">Type</th>
              <th className="p-2">To</th>
              <th className="p-2">Subject</th>
              <th className="p-2">Status</th>
              <th className="p-2">Open</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const when = e.occurredAt ?? e.createdAt;
              const isError =
                (e.eventType || "").toLowerCase().includes("bounce") ||
                (e.eventType || "").toLowerCase().includes("complain") ||
                !!e.errorMessage;

              const status = e.errorMessage
                ? `ERROR${e.errorCode ? ` (${e.errorCode})` : ""}`
                : e.eventType;

              return (
                <tr key={e.id} className={isError ? "bg-red-500/5 hover:bg-red-500/10" : "hover:bg-white/5"}>
                  <td className="p-2 whitespace-nowrap">{fmtTs(when)}</td>
                  <td className="p-2 whitespace-nowrap">{e.eventType}</td>
                  <td className="p-2">{short(e.toCsv, 34)}</td>
                  <td className="p-2">{short(e.subject, 44)}</td>
                  <td className="p-2">{short(status, 36)}</td>
                  <td className="p-2 whitespace-nowrap">
                    <Link className="underline underline-offset-2" href={`/admin/email-events/${e.id}`}>
                      View
                    </Link>
                    {e.clickLink ? (
                      <span className="ml-2 opacity-70" title={e.clickLink}>
                        • clicked
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}

            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-3 opacity-70">
                  No email events found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs opacity-70">
        Showing {rows.length} • offset {offset}
      </p>
    </div>
  );
}
