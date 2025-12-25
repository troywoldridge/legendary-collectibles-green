"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/components/admin/adminFetch";

type Item = {
  id: string;
  game: string;
  sku: string | null;
  title: string;
  condition: string;
  status: "draft" | "live" | "archived";
  on_hand: number;
  price_cents: number;
  cost_basis_cents: number;
  meta: any;
};

function centsToDollars(c: number) {
  return (Number(c || 0) / 100).toFixed(2);
}
function dollarsToCents(s: string) {
  const n = Math.round(Number(s || "0") * 100);
  return Number.isFinite(n) ? n : 0;
}

export default function ItemEditor({ id }: { id: string }) {
  const [item, setItem] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const [title, setTitle] = useState("");
  const [game, setGame] = useState("other");
  const [condition, setCondition] = useState("");
  const [price, setPrice] = useState("0.00");
  const [cost, setCost] = useState("0.00");
  const [imageUrls, setImageUrls] = useState("");

  async function load() {
    setMsg("");
    const res = await adminFetch(`/api/admin/inventory/items/${id}`);
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

    const it: Item = data.item;
    setItem(it);
    setTitle(it.title || "");
    setGame(it.game || "other");
    setCondition(it.condition || "");
    setPrice(centsToDollars(it.price_cents || 0));
    setCost(centsToDollars(it.cost_basis_cents || 0));
  }

  useEffect(() => {
    load().catch((e) => setMsg(e?.message || "Load failed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function save() {
    setBusy(true);
    setMsg("");
    try {
      const patch = {
        title: title.trim(),
        game,
        condition,
        priceCents: dollarsToCents(price),
        costBasisCents: dollarsToCents(cost),
      };

      const res = await adminFetch(`/api/admin/inventory/items/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });

      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) throw new Error(data?.error || `Save failed (HTTP ${res.status})`);

      // optional images add
      const urls = imageUrls
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (urls.length) {
        const res2 = await adminFetch(`/api/admin/inventory/items/${id}/images`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ urls }),
        });
        const t2 = await res2.text();
        const d2 = t2 ? JSON.parse(t2) : null;
        if (!res2.ok) throw new Error(d2?.error || `Images failed (HTTP ${res2.status})`);

        setImageUrls("");
      }

      setMsg("Saved ✅");
      await load();
    } catch (e: any) {
      setMsg(e?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    setMsg("");
    try {
      const res = await adminFetch(`/api/admin/inventory/items/${id}/publish`, { method: "POST" });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) throw new Error(data?.error || `Publish failed (HTTP ${res.status})`);

      setMsg("Published Live ✅");
      await load();
    } catch (e: any) {
      setMsg(e?.message || "Publish failed");
    } finally {
      setBusy(false);
    }
  }

  if (!item) return <div>Loading… {msg ? `(${msg})` : ""}</div>;

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 900 }}>
      <div style={{ opacity: 0.85 }}>
        <b>SKU:</b> {item.sku || "(none)"} &nbsp;•&nbsp; <b>On hand:</b> {item.on_hand} &nbsp;•&nbsp;{" "}
        <b>Status:</b> {item.status}
      </div>

      <label>
        <div style={{ opacity: 0.85, marginBottom: 6 }}>Title</div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ padding: "10px 12px", width: "100%" }} />
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <label>
          <div style={{ opacity: 0.85, marginBottom: 6 }}>Game</div>
          <select value={game} onChange={(e) => setGame(e.target.value)} style={{ padding: "10px 12px", width: "100%" }}>
            <option value="pokemon">pokemon</option>
            <option value="yugioh">yugioh</option>
            <option value="mtg">mtg</option>
            <option value="sports">sports</option>
            <option value="funko">funko</option>
            <option value="sealed">sealed</option>
            <option value="videogames">videogames</option>
            <option value="supplies">supplies</option>
            <option value="other">other</option>
          </select>
        </label>

        <label>
          <div style={{ opacity: 0.85, marginBottom: 6 }}>Condition</div>
          <input value={condition} onChange={(e) => setCondition(e.target.value)} style={{ padding: "10px 12px", width: "100%" }} />
        </label>

        <label>
          <div style={{ opacity: 0.85, marginBottom: 6 }}>Price ($)</div>
          <input value={price} onChange={(e) => setPrice(e.target.value)} style={{ padding: "10px 12px", width: "100%" }} />
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label>
          <div style={{ opacity: 0.85, marginBottom: 6 }}>Cost basis ($)</div>
          <input value={cost} onChange={(e) => setCost(e.target.value)} style={{ padding: "10px 12px", width: "100%" }} />
        </label>

        <label>
          <div style={{ opacity: 0.85, marginBottom: 6 }}>Add image URLs (comma separated)</div>
          <input
            value={imageUrls}
            onChange={(e) => setImageUrls(e.target.value)}
            placeholder="https://...jpg, https://...png"
            style={{ padding: "10px 12px", width: "100%" }}
          />
        </label>
      </div>

      {msg ? <div style={{ opacity: 0.9 }}>{msg}</div> : null}

      <div style={{ display: "flex", gap: 10 }}>
        <button disabled={busy} onClick={save} style={{ padding: "10px 12px" }}>
          {busy ? "Working…" : "Save"}
        </button>
        <button disabled={busy} onClick={publish} style={{ padding: "10px 12px" }}>
          {busy ? "Working…" : "Publish Live"}
        </button>
      </div>
    </div>
  );
}
