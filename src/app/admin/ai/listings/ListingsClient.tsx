/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type ProductRow = {
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

export default function ListingsClient() {
  const sp = useSearchParams();
  const initialProductId = (sp.get("productId") || "").trim() || null;
  const autoGen = (sp.get("autogen") || "").trim() === "1";

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [genLoading, setGenLoading] = useState(false);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [output, setOutput] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const [applyLoading, setApplyLoading] = useState(false);
  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const url = new URL("/api/admin/ai/listings", window.location.origin);
      if (q.trim()) url.searchParams.set("q", q.trim());
      if (status.trim()) url.searchParams.set("status", status.trim());
      url.searchParams.set("limit", "25");
      url.searchParams.set("offset", "0");

      const r = await fetch(url.toString(), { cache: "no-store" });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.message || "Failed to load");
      setRows(j.rows || []);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  async function generate(forId?: string) {
    const pid = forId || selectedId;
    if (!pid) return;

    setGenLoading(true);
    setError(null);
    setGenerationId(null);
    setOutput(null);

    try {
      const r = await fetch("/api/admin/ai/generate-listing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId: pid }),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.message || "Generation failed");
      setGenerationId(j.generationId ?? null);
      setOutput(j.output ?? null);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setGenLoading(false);
    }
  }

  async function apply() {
    if (!generationId) return;
    setApplyLoading(true);
    setError(null);

    try {
      const r = await fetch("/api/admin/ai/apply-listing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ generationId }),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.message || "Apply failed");
      await load();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setApplyLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Preselect by query param after rows load; optionally auto-generate once.
  useEffect(() => {
    if (!rows.length) return;
    if (!initialProductId) return;

    const found = rows.find((r) => r.id === initialProductId);
    if (!found) return;

    // only do this once per mount
    setSelectedId((prev) => (prev ? prev : initialProductId));

    if (autoGen) {
      // only fire once if we haven't generated yet
      if (!generationId && !genLoading && !output) {
        generate(initialProductId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);

  return (
    <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
      <div className="rounded-lg border border-white/10 p-4">
        <div className="flex gap-2 flex-wrap">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title/slug/sku…"
            className="w-full flex-1 min-w-60 rounded-md bg-black/30 border border-white/10 px-3 py-2"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-md bg-black/30 border border-white/10 px-3 py-2"
          >
            <option value="">All statuses</option>
            <option value="draft">draft</option>
            <option value="active">active</option>
            <option value="archived">archived</option>
          </select>
          <button
            onClick={load}
            className="rounded-md border border-white/10 px-3 py-2 hover:bg-white/5"
            disabled={loading}
          >
            {loading ? "Loading…" : "Search"}
          </button>
        </div>

        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}

        <div className="mt-4 max-h-[70vh] overflow-auto rounded-md border border-white/10">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-black/60 backdrop-blur">
              <tr className="text-left">
                <th className="p-2">Title</th>
                <th className="p-2">SKU</th>
                <th className="p-2">Status</th>
                <th className="p-2">Imgs</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const active = r.id === selectedId;
                return (
                  <tr
                    key={r.id}
                    className={active ? "bg-white/10" : "hover:bg-white/5"}
                    onClick={() => {
                      setSelectedId(r.id);
                      setGenerationId(null);
                      setOutput(null);
                      setError(null);
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <td className="p-2">
                      <div className="font-medium">{r.title}</div>
                      <div className="opacity-70">{r.slug}</div>
                    </td>
                    <td className="p-2">{r.sku ?? "—"}</td>
                    <td className="p-2">{r.status}</td>
                    <td className="p-2">{r.imageCount}</td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td className="p-3 opacity-70" colSpan={4}>
                    No products found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex gap-2 flex-wrap">
          <button
            onClick={() => generate()}
            disabled={!selectedId || genLoading}
            className="rounded-md border border-white/10 px-3 py-2 hover:bg-white/5"
          >
            {genLoading ? "Generating…" : "Generate JSON"}
          </button>

          <button
            onClick={apply}
            disabled={!generationId || applyLoading}
            className="rounded-md border border-white/10 px-3 py-2 hover:bg-white/5"
          >
            {applyLoading ? "Applying…" : "Apply to Product"}
          </button>

          {selectedId ? (
            <a
              className="rounded-md border border-white/10 px-3 py-2 hover:bg-white/5"
              href={`/products/${selected?.slug ?? ""}`}
              target="_blank"
              rel="noreferrer"
            >
              View Product
            </a>
          ) : null}
        </div>

        {selected ? (
          <p className="mt-3 text-xs opacity-70">
            Selected: {selected.title} • {selected.status} • {selected.imageCount} image(s)
          </p>
        ) : (
          <p className="mt-3 text-xs opacity-70">Select a product to begin.</p>
        )}
      </div>

      <div className="rounded-lg border border-white/10 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Generated Output</h2>
          {generationId ? (
            <span className="text-xs opacity-70">Generation: {generationId}</span>
          ) : (
            <span className="text-xs opacity-70">No generation yet</span>
          )}
        </div>

        <div className="mt-3 rounded-md border border-white/10 bg-black/30 p-3 max-h-[70vh] overflow-auto">
          {output ? (
            <pre className="text-xs whitespace-pre-wrap wrap-break-word">{JSON.stringify(output, null, 2)}</pre>
          ) : (
            <p className="text-sm opacity-70">
              Generate JSON to see strict output here. (Validation happens server-side.)
            </p>
          )}
        </div>

        {output?.copy?.listingTitle ? (
          <div className="mt-4 rounded-md border border-white/10 p-3">
            <div className="text-sm font-semibold">Preview</div>
            <div className="mt-2 text-sm">{output.copy.listingTitle}</div>
            {output.copy.highlights?.length ? (
              <ul className="mt-2 text-sm list-disc pl-5 opacity-90">
                {output.copy.highlights.map((h: string, idx: number) => (
                  <li key={idx}>{h}</li>
                ))}
              </ul>
            ) : null}
            {output.copy.descriptionMd ? (
              <p className="mt-2 text-sm opacity-90 whitespace-pre-wrap">{output.copy.descriptionMd}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
