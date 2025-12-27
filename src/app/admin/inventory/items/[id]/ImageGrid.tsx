"use client";

import { useEffect, useMemo, useState } from "react";
import { adminFetch } from "@/components/admin/adminFetch";

type Img = {
  id: string;
  url: string;
  sort_order: number;
  created_at: string;
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

export default function ImageGrid({
  itemId,
  refreshKey = 0,
}: {
  itemId: string;
  refreshKey?: number;
}) {
  const [images, setImages] = useState<Img[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  // drag state
  const [dragId, setDragId] = useState<string | null>(null);

  const orderedIds = useMemo(() => images.map((x) => x.id), [images]);

  async function load() {
    setMsg("");
    const res = await adminFetch(`/api/admin/inventory/items/${itemId}/images`);
    const data = await readJsonSafe(res);
    if (!res.ok) throw new Error(data?.error || `Load failed (HTTP ${res.status})`);

    const rows = Array.isArray(data?.images) ? data.images : [];
    setImages(
      rows.map((r: any) => ({
        id: String(r.id),
        url: String(r.url),
        sort_order: Number(r.sort_order || 0),
        created_at: String(r.created_at || ""),
      }))
    );
  }

  useEffect(() => {
    load().catch((e) => setMsg(e?.message || "Failed to load images"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, refreshKey]);

  async function remove(imageRowId: string) {
    if (!confirm("Remove this image?")) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await adminFetch(
        `/api/admin/inventory/items/${itemId}/images?imageRowId=${encodeURIComponent(imageRowId)}`,
        { method: "DELETE" }
      );
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(data?.error || `Delete failed (HTTP ${res.status})`);

      setImages((prev) => prev.filter((x) => x.id !== imageRowId));
    } catch (e: any) {
      setMsg(e?.message || "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function persistOrder(next: Img[]) {
    setBusy(true);
    setMsg("");
    try {
      const res = await adminFetch(`/api/admin/inventory/items/${itemId}/images`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderedIds: next.map((x) => x.id) }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(data?.error || `Reorder failed (HTTP ${res.status})`);

      setImages(next);
      setMsg("Order saved ✅");
    } catch (e: any) {
      setMsg(e?.message || "Reorder failed");
    } finally {
      setBusy(false);
    }
  }

  function onDragStart(id: string) {
    setDragId(id);
  }

  function onDrop(overId: string) {
    if (!dragId || dragId === overId) return;

    const next = [...images];
    const from = next.findIndex((x) => x.id === dragId);
    const to = next.findIndex((x) => x.id === overId);
    if (from === -1 || to === -1) return;

    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);

    // Optimistic UI, then persist
    void persistOrder(next);
    setDragId(null);
  }

  if (!images.length) {
    return (
      <div className="inv-imgpanel">
        {msg ? <div className="inv-imgmsg">{msg}</div> : null}
        <div className="inv-imgempty">No images yet.</div>
      </div>
    );
  }

  return (
    <div className="inv-imgpanel">
      {msg ? <div className="inv-imgmsg">{msg}</div> : null}

      <div className="inv-imggrid">
        {images.map((img) => (
          <div
            key={img.id}
            className={`inv-imgcard ${busy ? "is-busy" : ""}`}
            draggable={!busy}
            onDragStart={() => onDragStart(img.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(img.id)}
            title="Drag to reorder"
          >
            <div className="inv-imgthumb">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" />
            </div>

            <div className="inv-imgbar">
              <div className="inv-imgmeta">#{orderedIds.indexOf(img.id) + 1}</div>
              <button
                className="inv-imgdel"
                onClick={() => remove(img.id)}
                disabled={busy}
                type="button"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="inv-imghelp">
        Tip: drag thumbnails to reorder. First image becomes the “primary” image later.
      </div>
    </div>
  );
}
