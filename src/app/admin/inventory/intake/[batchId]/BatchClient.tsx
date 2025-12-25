"use client";

import { useEffect, useMemo, useState } from "react";
import { adminFetch } from "@/components/admin/adminFetch";

type Props = { batchId: string };

type Row = {
  id: string;
  status: string;
  game: string;
  sku: string | null;
  title: string | null;
  condition: string | null;
  qtyDelta: number | null;
  priceCents: number | null;
  error: string | null;
};

export default function BatchClient({ batchId }: Props) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErr("");
      setApplyMsg("");

      try {
        const res = await adminFetch(`/api/admin/inventory/import-batches/${batchId}`);
        const text = await res.text();
        const json = text ? JSON.parse(text) : null;

        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        if (!cancelled) setData(json);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (batchId) load();
    else {
      setLoading(false);
      setErr("Missing batchId");
    }

    return () => {
      cancelled = true;
    };
  }, [batchId]);

  const rows: Row[] = useMemo(() => {
    const r = data?.rows ?? [];
    // Your API may return snake_case keys if using raw SQL; normalize to camelCase here.
    return r.map((x: any) => ({
      id: x.id,
      status: x.status,
      game: x.game,
      sku: x.sku ?? null,
      title: x.title ?? null,
      condition: x.condition ?? null,
      qtyDelta: x.qtyDelta ?? x.qty_delta ?? null,
      priceCents: x.priceCents ?? x.price_cents ?? null,
      error: x.error ?? null,
    }));
  }, [data]);

  const pendingCount = rows.filter((r) => r.status === "pending").length;
  const errorCount = rows.filter((r) => r.status === "error").length;

  async function applyAllPending() {
    setApplying(true);
    setApplyMsg("");

    try {
      const res = await adminFetch(`/api/admin/inventory/import-batches/${batchId}/apply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}), // apply all pending
      });

      const text = await res.text();
      const json = text ? JSON.parse(text) : null;

      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);

      setApplyMsg(`Applied. appliedCount=${json?.appliedCount ?? json?.applied ?? "?"} failedCount=${json?.failedCount ?? 0}`);

      // reload batch after apply
      const r2 = await adminFetch(`/api/admin/inventory/import-batches/${batchId}`);
      const t2 = await r2.text();
      const j2 = t2 ? JSON.parse(t2) : null;
      if (r2.ok) setData(j2);
    } catch (e: any) {
      setApplyMsg(e?.message || "Apply error");
    } finally {
      setApplying(false);
    }
  }

  if (loading) return <div style={{ padding: 24 }}>Loading batch…</div>;
  if (err) return <div style={{ padding: 24 }}>Error: {err}</div>;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ padding: 12, border: "1px solid #444", marginBottom: 12 }}>
        BatchClient batchId prop: <b>{String(batchId)}</b>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>Inventory Intake Batch</div>
          <div style={{ opacity: 0.85 }}>
            Rows: {rows.length} • Pending: {pendingCount} • Errors: {errorCount}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            disabled={pendingCount === 0 || applying}
            onClick={applyAllPending}
            style={{ padding: "10px 12px" }}
          >
            {applying ? "Applying..." : `Apply all pending (${pendingCount})`}
          </button>
        </div>
      </div>

      {applyMsg ? <div style={{ marginTop: 10, opacity: 0.9 }}>{applyMsg}</div> : null}

      <div style={{ marginTop: 16, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.15)" }}>
              <th style={{ padding: "10px 8px" }}>status</th>
              <th style={{ padding: "10px 8px" }}>game</th>
              <th style={{ padding: "10px 8px" }}>sku</th>
              <th style={{ padding: "10px 8px" }}>title</th>
              <th style={{ padding: "10px 8px" }}>condition</th>
              <th style={{ padding: "10px 8px" }}>qtyDelta</th>
              <th style={{ padding: "10px 8px" }}>priceCents</th>
              <th style={{ padding: "10px 8px" }}>error</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <td style={{ padding: "10px 8px" }}>{r.status}</td>
                <td style={{ padding: "10px 8px" }}>{r.game}</td>
                <td style={{ padding: "10px 8px" }}>{r.sku || ""}</td>
                <td style={{ padding: "10px 8px" }}>{r.title || ""}</td>
                <td style={{ padding: "10px 8px" }}>{r.condition || ""}</td>
                <td style={{ padding: "10px 8px" }}>{r.qtyDelta ?? ""}</td>
                <td style={{ padding: "10px 8px" }}>{r.priceCents ?? ""}</td>
                <td style={{ padding: "10px 8px", opacity: 0.9 }}>{r.error || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
