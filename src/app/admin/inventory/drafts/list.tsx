"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/components/admin/adminFetch";
import Link from "next/link";

type Item = {
  id: string;
  game: string;
  sku: string | null;
  title: string;
  condition: string;
  onHand: number;
  priceCents: number;
  status: string;
};

async function readJsonSafe(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 200) };
  }
}

function toItem(row: any): Item {
  return {
    id: String(row?.id ?? ""),
    game: String(row?.game ?? "other"),
    sku: row?.sku ?? null,
    title: String(row?.title ?? ""),
    condition: String(row?.condition ?? ""),
    // accept either snake_case or camelCase (future-proof)
    onHand: Number(row?.onHand ?? row?.on_hand ?? 0),
    priceCents: Number(row?.priceCents ?? row?.price_cents ?? 0),
    status: String(row?.status ?? "draft"),
  };
}

export default function DraftsList() {
  const [items, setItems] = useState<Item[]>([]);
  const [msg, setMsg] = useState("");

  async function load() {
    setMsg("");
    try {
      const res = await adminFetch("/api/admin/inventory/items?status=draft");
      const data = await readJsonSafe(res);

      if (!res.ok) {
        setMsg(data?.error || `Failed (HTTP ${res.status})`);
        return;
      }

      const rows = Array.isArray(data?.items) ? data.items : [];
      setItems(rows.map(toItem));
    } catch (e: any) {
      setMsg(e?.message || "Failed");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function publish(id: string) {
    setMsg("");
    try {
      const res = await adminFetch(`/api/admin/inventory/items/${id}/publish`, {
        method: "POST",
      });
      const data = await readJsonSafe(res);
      if (!res.ok) {
        setMsg(data?.error || `Publish failed (HTTP ${res.status})`);
        return;
      }
      await load();
    } catch (e: any) {
      setMsg(e?.message || "Publish failed");
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800 }}>Drafts</h1>
      {msg ? <div style={{ marginTop: 10 }}>{msg}</div> : null}

      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
        {items.map((it) => (
          <div
            key={it.id}
            style={{ border: "1px solid #333", padding: 12, borderRadius: 8 }}
          >
            <div style={{ fontWeight: 700 }}>{it.title}</div>
            <div style={{ opacity: 0.8, marginTop: 4 }}>
              {it.game} • {it.condition} • onHand: {it.onHand} • $
              {(it.priceCents / 100).toFixed(2)}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <Link href={`/admin/inventory/items/${it.id}`}>Edit</Link>
              <button
                onClick={() => publish(it.id)}
                style={{ padding: "6px 10px" }}
              >
                Publish
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
