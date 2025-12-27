"use client";

import { useMemo, useState } from "react";
import { adminFetch } from "@/components/admin/adminFetch";

type Props = {
  itemId: string;
  onUploaded?: () => void; // call to refresh item data
};

async function safeJson(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}

export default function ImageDropzone({ itemId, onUploaded }: Props) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const accept = useMemo(
    () => ["image/jpeg", "image/png", "image/webp", "image/gif"],
    []
  );

  async function uploadOne(file: File) {
    // 1) Ask our server for a one-time CF upload URL
    const createRes = await adminFetch("/api/admin/images/direct-upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        metadata: { itemId, filename: file.name },
      }),
    });
    const createData = await safeJson(createRes);
    if (!createRes.ok) throw new Error(createData?.error || "Failed to create upload URL");

    const { uploadURL, id: imageId } = createData;

    // 2) Upload file directly to Cloudflare uploadURL
    const fd = new FormData();
    fd.append("file", file);

    const upRes = await fetch(uploadURL, { method: "POST", body: fd });
    // Cloudflare uploadURL returns JSON on success; we don’t really need it
    if (!upRes.ok) {
      const upText = await upRes.text().catch(() => "");
      throw new Error(`Cloudflare upload failed (${upRes.status}): ${upText.slice(0, 200)}`);
    }

    // 3) Attach this image to the inventory item (store delivery URL row)
    const attachRes = await adminFetch(`/api/admin/inventory/items/${itemId}/images`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageId }),
    });
    const attachData = await safeJson(attachRes);
    if (!attachRes.ok) throw new Error(attachData?.error || "Failed to attach image");

    return attachData?.url as string;
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setMsg("");

    try {
      const list = Array.from(files).filter((f) => accept.includes(f.type));
      if (!list.length) throw new Error("No supported image files selected");

      for (const f of list) {
        await uploadOne(f);
      }

      setMsg(`Uploaded ${list.length} image(s).`);
      onUploaded?.();
    } catch (e: any) {
      setMsg(e?.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    void onFiles(e.dataTransfer.files);
  }

  return (
    <div className="inv-dropzone-wrap">
      <div
        className={`inv-dropzone ${busy ? "is-busy" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={onDrop}
      >
        <div className="inv-dropzone-title">
          Drag & drop images here
        </div>
        <div className="inv-dropzone-sub">
          or choose files (jpg/png/webp/gif)
        </div>

        <label className="inv-dropzone-btn">
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={busy}
            onChange={(e) => void onFiles(e.target.files)}
            style={{ display: "none" }}
          />
          {busy ? "Uploading..." : "Choose Images"}
        </label>
      </div>

      {msg ? <div className="inv-dropzone-msg">{msg}</div> : null}
    </div>
  );
}
