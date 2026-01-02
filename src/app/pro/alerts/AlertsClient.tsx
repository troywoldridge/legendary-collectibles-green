"use client";

import { useEffect, useState } from "react";

type AlertRow = {
  id: string;
  game: string;
  rule_type: "above" | "below";
  threshold: number;
  active: boolean;

  display_name: string;
  set_name?: string | null;
  number?: string | null;
  image_url?: string | null;
};

function fmtUsd(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function gameLabel(g: string) {
  if (g === "pokemon") return "Pokémon";
  if (g === "mtg") return "Magic";
  if (g === "yugioh") return "Yu-Gi-Oh!";
  return g;
}

export default function AlertsClient() {
  const [rows, setRows] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/pro/alerts", { cache: "no-store" });
      const json = await res.json();
      setRows(json.rows ?? []);
    } catch (e: any) {
      setErr("Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/pro/alerts?id=${id}`, { method: "DELETE" });
    setRows((r) => r.filter((x) => x.id !== id));
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return <div className="text-sm text-white/60">Loading alerts…</div>;
  }

  if (err) {
    return (
      <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">
        {err}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-white/20 bg-black/30 p-4 text-sm text-white/70">
        You don’t have any price alerts yet.
        <div className="mt-2 text-xs text-white/60">
          Alerts can be created from card pages or your collection (coming next).
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((a) => (
        <div
          key={a.id}
          className="flex items-center gap-3 rounded-xl border border-white/20 bg-black/40 p-3"
        >
          {a.image_url && (
            <img
              src={a.image_url}
              className="h-12 w-9 rounded border border-white/20 object-contain bg-black/40"
              alt=""
            />
          )}

          <div className="flex-1">
            <div className="font-medium">{a.display_name}</div>
            <div className="text-xs text-white/60">
              {gameLabel(a.game)}
              {a.set_name ? ` • ${a.set_name}` : ""}
              {a.number ? ` #${a.number}` : ""}
            </div>
            <div className="mt-1 text-xs text-white/70">
              Alert when price goes{" "}
              <span className="font-semibold">
                {a.rule_type === "above" ? "above" : "below"} {fmtUsd(a.threshold)}
              </span>
            </div>
          </div>

          <button
            onClick={() => remove(a.id)}
            className="rounded-md border border-white/25 bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
          >
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}
