"use client";

import { useEffect, useMemo, useState } from "react";
import { adminFetch } from "@/components/admin/adminFetch";

type Row = {
  id: string;
  status: "pending" | "error" | "applied";
  error: string | null;

  game: string | null;
  sku: string | null;
  title: string | null;
  condition: string | null;
  qtyDelta: number | null;
  priceCents: number | null;
  notes: string | null;
};

export default function BatchReview({ batchId }: { batchId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    setMsg("");
    const res = await adminFetch(`/api/admin/inventory/import-batches/${batchId}`);
    const data = await res.json();
    if (!res.ok) {
      setMsg(data?.error || "Failed to load batch");
      return;
    }
    setRows(data.rows || []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  const pendingValid = useMemo(
    () => rows.filter((r) => r.status === "pending"),
    [rows]
  );

  async function applyAllPending() {
    setBusy(true);
    setMsg("");
    try {
      const res = await adminFetch(`/api/admin/inventory/import-batches/${batchId}/apply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Apply failed");

      setMsg(`Applied ${data.appliedCount} rows, failed ${data.failedCount}`);
      await load();
    } catch (e: any) {
      setMsg(e?.message || "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800 }}>Batch Review</h1>
      <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
        <button disabled={busy || pendingValid.length === 0} onClick={applyAllPending} style={{ padding: "10px 12px" }}>
          {busy ? "Applying..." : `Apply all pending (${pendingValid.length})`}
        </button>
        {msg ? <span style={{ opacity: 0.9 }}>{msg}</span> : null}
      </div>

      <div style={{ marginTop: 14, overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              {["status","game","sku","title","condition","qtyDelta","priceCents","error"].map((h) => (
                <th key={h} style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ padding: 8 }}>{r.status}</td>
                <td style={{ padding: 8 }}>{r.game}</td>
                <td style={{ padding: 8 }}>{r.sku}</td>
                <td style={{ padding: 8 }}>{r.title}</td>
                <td style={{ padding: 8 }}>{r.condition}</td>
                <td style={{ padding: 8 }}>{r.qtyDelta}</td>
                <td style={{ padding: 8 }}>{r.priceCents}</td>
                <td style={{ padding: 8, color: r.status === "error" ? "salmon" : undefined }}>{r.error}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
