"use client";

import { useMemo, useState } from "react";

type Alert = {
  id: string;
  game: string;
  card_id: string;
  source: string;
  rule_type: string;
  threshold: number;
  active: boolean;
  created_at: string;
};

export default function AlertsList({ initialAlerts }: { initialAlerts: Alert[] }) {
  const [alerts, setAlerts] = useState<Alert[]>(initialAlerts);
  const [busyId, setBusyId] = useState<string | null>(null);

  const empty = useMemo(() => alerts.length === 0, [alerts.length]);

  async function deleteAlert(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/pro/alerts?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Delete failed");
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  if (empty) return <div className="text-white/70">No alerts yet.</div>;

  return (
    <div className="space-y-2">
      {alerts.map((a) => (
        <div
          key={a.id}
          className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2"
        >
          <div className="text-sm text-white/90">
            <b>{a.game}</b> • {a.card_id} • {a.source} • {a.rule_type} ${Number(a.threshold).toFixed(2)}
          </div>
          <button
            className="text-sm text-red-300 hover:text-red-200 disabled:opacity-50"
            disabled={busyId === a.id}
            onClick={() => deleteAlert(a.id)}
          >
            {busyId === a.id ? "Deleting…" : "Delete"}
          </button>
        </div>
      ))}
    </div>
  );
}
