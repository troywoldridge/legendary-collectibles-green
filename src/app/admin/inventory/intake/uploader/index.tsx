"use client";

import { useState } from "react";
import { adminFetch } from "@/components/admin/adminFetch";
import { useRouter } from "next/navigation";



export default function CsvUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const router = useRouter();

  async function upload() {
    if (!file) return;
    setBusy(true);
    setMsg("");

    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await adminFetch("/api/admin/import-csv", {


        method: "POST",
        body: fd,
      });

      const text = await res.text();
let data: any = null;

try {
  data = text ? JSON.parse(text) : null;
} catch {
  throw new Error(data?.detail || data?.error || "Upload failed");

}

if (!res.ok) throw new Error(data?.error || `Upload failed (HTTP ${res.status})`);
if (!data?.batchId) throw new Error(`Upload returned no batchId (HTTP ${res.status})`);


      setMsg(
        `Batch created: ${data.batchId} (rows=${data.totalRows}, errors=${data.errors})`
      );
      router.push(`/admin/inventory/intake/${data.batchId}`);
    } catch (e: any) {
      setMsg(e?.message || "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />
      <button
        disabled={!file || busy}
        onClick={upload}
        style={{ padding: "10px 12px", width: 220 }}
      >
        {busy ? "Uploading..." : "Upload CSV"}
      </button>
      {msg ? <div style={{ opacity: 0.9 }}>{msg}</div> : null}
    </div>
  );
}
