"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type OrderRow = {
  id: string;
  status: string;
  currency: string;

  subtotalCents: number;
  taxCents: number;
  shippingCents: number;
  totalCents: number;

  itemsCount: number;
  itemsLineTotalCents: number;

  email: string | null;
  customerName: string | null;
  customerPhone: string | null;

  shippingName: string | null;
  shippingPhone: string | null;

  stripeSessionId: string;
  stripePaymentIntentId: string | null;

  createdAt: string;
  updatedAt: string;
};

function money(cents: number | null | undefined, currency: string | null | undefined) {
  if (cents == null) return "—";
  const cur = (currency || "usd").toUpperCase();
  return `${cur} ${(cents / 100).toFixed(2)}`;
}

function fmtTs(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString();
}

function short(v: string | null, n = 28) {
  if (!v) return "—";
  const s = String(v);
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

const STATUS_OPTIONS = ["", "pending", "paid", "fulfilled", "canceled", "refunded"];

export default function OrdersClient() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [limit] = useState(25);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canNext = useMemo(() => rows.length === limit, [rows, limit]);

  async function load(nextOffset = 0) {
    setLoading(true);
    setErr(null);
    try {
      const url = new URL("/api/admin/orders", window.location.origin);
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("offset", String(nextOffset));
      if (q.trim()) url.searchParams.set("q", q.trim());
      if (status) url.searchParams.set("status", status);

      const r = await fetch(url.toString(), { cache: "no-store" });
      const j = await r.json();

      if (!j?.ok) throw new Error(j?.message || "Failed to load orders");
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
          placeholder="Search id, email, name, stripe session, payment intent…"
          className="w-full rounded-md bg-black/20 border border-white/10 px-3 py-2"
        />

        <div className="flex flex-wrap gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-md bg-black/20 border border-white/10 px-3 py-2"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.filter(Boolean).map((s) => (
              <option key={s} value={s}>
                {s}
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
              <th className="p-2">Created</th>
              <th className="p-2">Order</th>
              <th className="p-2">Status</th>
              <th className="p-2">Items</th>
              <th className="p-2">Total</th>
              <th className="p-2">Customer</th>
              <th className="p-2">Stripe</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const isPending = o.status === "pending";
              const isBad = o.status === "canceled" || o.status === "refunded";
              const rowClass = isBad
                ? "bg-red-500/5 hover:bg-red-500/10"
                : isPending
                  ? "bg-yellow-500/5 hover:bg-yellow-500/10"
                  : "hover:bg-white/5";

              const customer = o.customerName || o.shippingName || o.email || "—";

              const mismatch =
                (o.itemsLineTotalCents ?? 0) !== (o.subtotalCents ?? 0);

              return (
                <tr key={o.id} className={rowClass}>
                  <td className="p-2 whitespace-nowrap">{fmtTs(o.createdAt)}</td>

                  <td className="p-2 whitespace-nowrap">
                    <Link className="underline underline-offset-2" href={`/admin/orders/${o.id}`}>
                      {o.id}
                    </Link>
                  </td>

                  <td className="p-2 whitespace-nowrap">{o.status}</td>

                  <td className="p-2 whitespace-nowrap">
                    <div className="font-medium">{o.itemsCount ?? 0}</div>
                    <div className="text-xs opacity-70">
                      items {money(o.itemsLineTotalCents, o.currency)}
                      {mismatch ? <span className="ml-2 text-yellow-300">• subtotal mismatch</span> : null}
                    </div>
                  </td>

                  <td className="p-2 whitespace-nowrap">
                    <div className="font-medium">{money(o.totalCents, o.currency)}</div>
                    <div className="text-xs opacity-70">
                      ship {money(o.shippingCents, o.currency)} • tax {money(o.taxCents, o.currency)}
                    </div>
                  </td>

                  <td className="p-2">
                    <div>{short(customer, 34)}</div>
                    <div className="text-xs opacity-70">{short(o.email, 34)}</div>
                  </td>

                  <td className="p-2">
                    <div title={o.stripeSessionId} className="whitespace-nowrap">
                      sess: {short(o.stripeSessionId, 18)}
                    </div>
                    <div title={o.stripePaymentIntentId ?? ""} className="text-xs opacity-70 whitespace-nowrap">
                      pi: {short(o.stripePaymentIntentId, 18)}
                    </div>
                  </td>
                </tr>
              );
            })}

            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-3 opacity-70">
                  No orders found.
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
