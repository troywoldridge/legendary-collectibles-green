/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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

  aiGenerationId: string | null;
  aiStatus: "draft" | "applied" | "error" | null;
  aiSchemaVersion: string | null;
  aiModel: string | null;
  aiErrorText: string | null;
  aiCreatedAt: string | null;
  aiUpdatedAt: string | null;
};

function badgeClassForAi(status: ProductRow["aiStatus"]) {
  if (status === "applied") return "bg-emerald-500/15 text-emerald-200 border-emerald-400/20";
  if (status === "draft") return "bg-amber-500/15 text-amber-200 border-amber-400/20";
  if (status === "error") return "bg-red-500/15 text-red-200 border-red-400/20";
  return "bg-white/10 text-white/70 border-white/10";
}

function labelForAi(status: ProductRow["aiStatus"]) {
  if (status === "applied") return "applied";
  if (status === "draft") return "draft";
  if (status === "error") return "error";
  return "—";
}

export default function ListingsClient() {
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
  const [loadGenLoading, setLoadGenLoading] = useState(false);

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId],
  );

  function resetGenerationState() {
    setGenerationId(null);
    setOutput(null);
  }

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

      const newRows = (j.rows || []) as ProductRow[];
      setRows(newRows);

      if (!selectedId && newRows?.[0]?.id) {
        setSelectedId(newRows[0].id);
      }
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generate() {
    if (!selectedId) return;

    setGenLoading(true);
    setError(null);
    resetGenerationState();

    try {
      const r = await fetch("/api/admin/ai/generate-listing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId: selectedId }),
      });

      const j = await r.json();
      if (!j?.ok) throw new Error(j?.message || "Generation failed");

      setGenerationId(j.generationId ?? null);
      setOutput(j.output ?? null);

      await load();
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
      setGenerationId(null);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setApplyLoading(false);
    }
  }

  async function openLatestGeneration() {
    if (!selected?.aiGenerationId) return;

    setLoadGenLoading(true);
    setError(null);

    try {
      const r = await fetch(`/api/admin/ai/listings/${selected.aiGenerationId}`, { cache: "no-store" });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.message || "Failed to load generation");

      setGenerationId(selected.aiGenerationId);
      setOutput(j.row?.output ?? null);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoadGenLoading(false);
    }
  }

  const aiTitle =
    selected?.aiStatus === "error"
      ? `Latest AI: error\n${selected.aiErrorText ?? ""}`.trim()
      : selected?.aiGenerationId
        ? `Latest AI: ${selected.aiStatus ?? "—"}\nGeneration: ${selected.aiGenerationId}`
        : "No AI generation yet";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* LEFT */}
      <div className="rounded-lg border border-white/10 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title/slug/sku…"
            className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2"
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
                <th className="p-2">AI</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r) => {
                const active = r.id === selectedId;

                const aiTooltipParts: string[] = [];
                if (r.aiGenerationId) aiTooltipParts.push(`Generation: ${r.aiGenerationId}`);
                if (r.aiStatus) aiTooltipParts.push(`Status: ${r.aiStatus}`);
                if (r.aiSchemaVersion) aiTooltipParts.push(`Schema: ${r.aiSchemaVersion}`);
                if (r.aiModel) aiTooltipParts.push(`Model: ${r.aiModel}`);
                if (r.aiStatus === "error" && r.aiErrorText) aiTooltipParts.push(`Error: ${r.aiErrorText}`);

                const aiTooltip = aiTooltipParts.join("\n") || "No AI generation yet";

                return (
                  <tr
                    key={r.id}
                    className={active ? "bg-white/10" : "hover:bg-white/5"}
                    onClick={() => {
                      setSelectedId(r.id);
                      resetGenerationState();
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
                    <td className="p-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${badgeClassForAi(
                          r.aiStatus,
                        )}`}
                        title={aiTooltip}
                      >
                        {labelForAi(r.aiStatus)}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {rows.length === 0 ? (
                <tr>
                  <td className="p-3 opacity-70" colSpan={5}>
                    No products found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={generate}
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

          <button
            onClick={openLatestGeneration}
            disabled={!selected?.aiGenerationId || loadGenLoading}
            className="rounded-md border border-white/10 px-3 py-2 hover:bg-white/5"
            title={aiTitle}
          >
            {loadGenLoading ? "Loading…" : "Open Latest Generation"}
          </button>

          {selected?.slug ? (
            <Link
              href={`/products/${selected.slug}`}
              target="_blank"
              className="rounded-md border border-white/10 px-3 py-2 hover:bg-white/5"
            >
              View product ↗
            </Link>
          ) : null}
        </div>

        {selected ? (
          <p className="mt-3 text-xs opacity-70">
            Selected: {selected.title} • {selected.status} • {selected.imageCount} image(s)
            {selected.aiStatus ? ` • AI: ${selected.aiStatus}` : ""}
          </p>
        ) : (
          <p className="mt-3 text-xs opacity-70">Select a product to begin.</p>
        )}
      </div>

      {/* RIGHT */}
      <div className="rounded-lg border border-white/10 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Generated Output</h2>
          {generationId ? (
            <span className="text-xs opacity-70">Generation: {generationId}</span>
          ) : (
            <span className="text-xs opacity-70">No active generation</span>
          )}
        </div>

        <div className="mt-3 rounded-md border border-white/10 bg-black/30 p-3 max-h-[35vh] overflow-auto">
          {output ? (
            <pre className="text-xs whitespace-pre-wrap break-words">
              {JSON.stringify(output, null, 2)}
            </pre>
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
              <div className="mt-3">
                <div className="text-xs uppercase tracking-wide opacity-70">Description (Markdown)</div>
                <pre className="mt-1 text-xs whitespace-pre-wrap break-words rounded-md border border-white/10 bg-black/20 p-3">
                  {output.copy.descriptionMd}
                </pre>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
