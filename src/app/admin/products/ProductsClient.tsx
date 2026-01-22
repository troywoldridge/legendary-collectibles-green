/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  id: string;
  title: string;
  slug: string;
  sku: string | null;
  game: string;
  format: string;
  sealed: boolean;
  isGraded: boolean;
  grader: string | null;
  gradeX10: number | null;
  condition: string | null;
  priceCents: number;
  quantity: number;
  status: string;
  updatedAt: string;
  imageCount: number;
};

type Counts = { total: number; draft: number; active: number; archived: number };

function money(cents: number) {
  const n = Number(cents ?? 0);
  const dollars = (n / 100).toFixed(2);
  return `$${dollars}`;
}

export default function ProductsClient() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [game, setGame] = useState("");
  const [format, setFormat] = useState("");

  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Counts>({ total: 0, draft: 0, active: 0, archived: 0 });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [limit] = useState(25);
  const [offset, setOffset] = useState(0);

  const canPrev = offset > 0;
  const canNext = useMemo(() => rows.length === limit, [rows.length, limit]);

  async function load(nextOffset = offset) {
    setLoading(true);
    setError(null);
    try {
      const url = new URL("/api/admin/products", window.location.origin);
      if (q.trim()) url.searchParams.set("q", q.trim());
      if (status.trim()) url.searchParams.set("status", status.trim());
      if (game.trim()) url.searchParams.set("game", game.trim());
      if (format.trim()) url.searchParams.set("format", format.trim());
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("offset", String(nextOffset));

      const r = await fetch(url.toString(), { cache: "no-store" });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.message || "Failed to load products");

      setRows(j.rows || []);
      setCounts(j.counts || { total: 0, draft: 0, active: 0, archived: 0 });
      setOffset(nextOffset);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function quickStatus(s: string) {
    setStatus(s);
    load(0);
  }

  return (
    <div className="grid gap-6">
      <div className="rounded-lg border border-white/10 p-4">
        <div className="flex flex-wrap gap-2 items-center">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title/slug/sku…"
            className="min-w-60 flex-1 rounded-md bg-black/30 border border-white/10 px-3 py-2"
          />

          <input
            value={game}
            onChange={(e) => setGame(e.target.value)}
            placeholder="game (optional) e.g. pokemon"
            className="w-[220px] rounded-md bg-black/30 border border-white/10 px-3 py-2"
          />

          <input
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            placeholder="format (optional) e.g. single"
            className="w-[220px] rounded-md bg-black/30 border border-white/10 px-3 py-2"
          />

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-[180px] rounded-md bg-black/30 border border-white/10 px-3 py-2"
          >
            <option value="">All statuses</option>
            <option value="draft">draft</option>
            <option value="active">active</option>
            <option value="archived">archived</option>
          </select>

          <button
            onClick={() => load(0)}
            className="rounded-md border border-white/10 px-3 py-2 hover:bg-white/5"
            disabled={loading}
          >
            {loading ? "Loading…" : "Search"}
          </button>

          <a
            href="/admin/products/new"
            className="rounded-md border border-white/10 px-3 py-2 hover:bg-white/5"
          >
            + New
          </a>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <button
            className="rounded-md border border-white/10 px-3 py-1.5 hover:bg-white/5"
            onClick={() => quickStatus("")}
          >
            All ({counts.total})
          </button>
          <button
            className="rounded-md border border-white/10 px-3 py-1.5 hover:bg-white/5"
            onClick={() => quickStatus("draft")}
          >
            Draft ({counts.draft})
          </button>
          <button
            className="rounded-md border border-white/10 px-3 py-1.5 hover:bg-white/5"
            onClick={() => quickStatus("active")}
          >
            Active ({counts.active})
          </button>
          <button
            className="rounded-md border border-white/10 px-3 py-1.5 hover:bg-white/5"
            onClick={() => quickStatus("archived")}
          >
            Archived ({counts.archived})
          </button>
        </div>

        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      </div>

      <div className="rounded-lg border border-white/10 overflow-hidden">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-black/60 backdrop-blur">
              <tr className="text-left">
                <th className="p-2">Title</th>
                <th className="p-2">SKU</th>
                <th className="p-2">Game</th>
                <th className="p-2">Format</th>
                <th className="p-2">Status</th>
                <th className="p-2">Qty</th>
                <th className="p-2">Price</th>
                <th className="p-2">Imgs</th>
                <th className="p-2">Links</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-white/5">
                  <td className="p-2">
                    <div className="font-medium">{r.title}</div>
                    <div className="opacity-70">{r.slug}</div>
                  </td>
                  <td className="p-2">{r.sku ?? "—"}</td>
                  <td className="p-2">{r.game}</td>
                  <td className="p-2">{r.format}</td>
                  <td className="p-2">{r.status}</td>
                  <td className="p-2">{r.quantity}</td>
                  <td className="p-2">{money(r.priceCents)}</td>
                  <td className="p-2">{r.imageCount}</td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-2">
                      <a
                        className="rounded-md border border-white/10 px-2 py-1 hover:bg-white/5"
                        href={`/products/${r.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        title="View public product page"
                      >
                        View
                      </a>
                      <a
                        className="rounded-md border border-white/10 px-2 py-1 hover:bg-white/5"
                        href={`/admin/ai/listings?productId=${encodeURIComponent(r.id)}`}
                        title="Open AI Listings with this product selected"
                      >
                        AI
                      </a>
                      <a
                        className="rounded-md border border-white/10 px-2 py-1 hover:bg-white/5"
                        href={`/admin/ai/listings?productId=${encodeURIComponent(r.id)}&autogen=1`}
                        title="Open AI Listings and auto-generate"
                      >
                        AI+Gen
                      </a>
                    </div>
                  </td>
                </tr>
              ))}

              {rows.length === 0 ? (
                <tr>
                  <td className="p-3 opacity-70" colSpan={9}>
                    No products found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-2 p-3 border-t border-white/10">
          <div className="text-xs opacity-70">
            Showing {rows.length} • Offset {offset}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => load(Math.max(0, offset - limit))}
              disabled={!canPrev || loading}
              className="rounded-md border border-white/10 px-3 py-1.5 hover:bg-white/5 disabled:opacity-50"
            >
              Prev
            </button>
            <button
              onClick={() => load(offset + limit)}
              disabled={!canNext || loading}
              className="rounded-md border border-white/10 px-3 py-1.5 hover:bg-white/5 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
