/* eslint-disable @typescript-eslint/no-unused-vars */
// src/app/admin/funko/new/FunkoNewFormClient.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

function parseTags(input: string): string[] {
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter(
      (v, i, arr) => arr.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i,
    );
}

function safeParseJson(text: string): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const v = JSON.parse(text);
    if (v && typeof v === "object" && !Array.isArray(v)) return { ok: true, value: v as any };
    return { ok: false, error: "extra_json must be a JSON object (not an array/string)." };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Invalid JSON." };
  }
}

export default function FunkoNewFormClient({
  action,
}: {
  action: (formData: FormData) => void | Promise<void>;
}) {
  // Tags + Notes (used to generate JSON)
  const [tagsText, setTagsText] = useState("");
  const [notes, setNotes] = useState("");

  // Manual override for JSON
  const [manual, setManual] = useState(false);
  const [extraText, setExtraText] = useState("{}");
  const [jsonError, setJsonError] = useState<string>("");

  const tags = useMemo(() => parseTags(tagsText), [tagsText]);

  const generatedExtra = useMemo(() => {
    // Keep this minimal + future-proof. You can add more keys anytime.
    return {
      tags,
      notes: notes?.trim() ? notes.trim() : undefined,
    };
  }, [tags, notes]);

  useEffect(() => {
    if (manual) return;
    setExtraText(JSON.stringify(generatedExtra, null, 2));
    setJsonError("");
  }, [generatedExtra, manual]);

  // Validate JSON when manually editing
  useEffect(() => {
    if (!manual) return;
    const p = safeParseJson(extraText);
    setJsonError(p.ok ? "" : p.error);
  }, [extraText, manual]);

  return (
    <form action={action} className="space-y-6">
      {/* Core identifiers */}
      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <h2 className="text-lg font-semibold text-white">Core identifiers</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field
            name="id"
            label="Canonical ID (optional)"
            placeholder="funko:72471"
            help="If blank, we’ll auto-generate funko:<upc>."
          />
          <Field name="upc" label="UPC (recommended)" placeholder="889698724715" />

          <Field name="source" label="Source" placeholder="manual" />
          <Field name="source_id" label="Source ID" placeholder="FUKO72471" />
        </div>
      </div>

      {/* Catalog fields */}
      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <h2 className="text-lg font-semibold text-white">Catalog fields</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field name="name" label="Name" placeholder="Chica (FNAF)" />
          <Field name="franchise" label="Franchise" placeholder="Five Nights at Freddy's" />
          <Field name="series" label="Series" placeholder="Help Wanted 2" />
          <Field name="line" label="Line" placeholder="Pop! Games" />
          <Field name="number" label="Number" placeholder="72471" />
          <Field name="edition" label="Edition" placeholder="(optional)" />
          <Field name="variant" label="Variant (text)" placeholder="(optional)" />
          <Field name="exclusivity" label="Exclusivity (text)" placeholder="Hot Topic / SDCC / etc." />
          <Field name="release_year" label="Release Year" placeholder="2025" />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Toggle name="is_chase" label="Is Chase?" />
          <Toggle name="is_exclusive" label="Is Exclusive?" />
        </div>

        {/* Legacy single-image fields (optional, keep for compatibility) */}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field
            name="image_small"
            label="Image (small) (legacy)"
            placeholder="https://imagedelivery.net/.../productTile"
          />
          <Field
            name="image_large"
            label="Image (large) (legacy)"
            placeholder="https://imagedelivery.net/.../productTile"
          />
        </div>

        <div className="mt-4">
          <TextArea
            name="description"
            label="Description"
            placeholder="Paste the official Funko description here…"
          />
        </div>
      </div>

      {/* Gallery images (main + 1–5) */}
      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <h2 className="text-lg font-semibold text-white">Gallery (main + up to 5)</h2>
        <p className="mt-1 text-sm text-white/70">
          Saves to <code>public.funko_item_images</code>.
          <span className="mt-1 block text-white/50">
            <strong>Main image</strong> is always <code>sort_order = 0</code> with <code>label = main</code>.
          </span>
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field
            name="img_main"
            label="Main image (sort 0)"
            placeholder="https://imagedelivery.net/.../<image_id>/productTile"
            help="This is the image used on grids + detail page."
          />
          <Field name="img_1" label="Alt 1 (sort 1)" placeholder="https://imagedelivery.net/.../<image_id>/productTile" />
          <Field name="img_2" label="Alt 2 (sort 2)" placeholder="https://imagedelivery.net/.../<image_id>/productTile" />
          <Field name="img_3" label="Alt 3 (sort 3)" placeholder="https://imagedelivery.net/.../<image_id>/productTile" />
          <Field name="img_4" label="Alt 4 (sort 4)" placeholder="https://imagedelivery.net/.../<image_id>/productTile" />
          <Field name="img_5" label="Alt 5 (sort 5)" placeholder="https://imagedelivery.net/.../<image_id>/productTile" />
        </div>
      </div>

      {/* Tags + Auto Extra JSON */}
      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <h2 className="text-lg font-semibold text-white">Tags + Extra JSON</h2>
        <p className="mt-1 text-sm text-white/70">
          Tags/notes are used to auto-generate a JSON blob stored in <code>funko_items.extra</code>.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block">
            <div className="text-xs uppercase tracking-wide text-white/60">Tags (comma separated)</div>
            <input
              name="tags_text"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="FNAF, Pop! Games, Horror, Animatronic"
              className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40"
            />
            <div className="mt-2 text-xs text-white/50">
              Stored as <code>extra.tags</code> (array).
            </div>
          </label>

          <label className="block">
            <div className="text-xs uppercase tracking-wide text-white/60">Notes (optional)</div>
            <input
              name="extra_notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes (not customer-facing)…"
              className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40"
            />
            <div className="mt-2 text-xs text-white/50">
              Stored as <code>extra.notes</code>.
            </div>
          </label>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="text-xs text-white/60">
            JSON below is what gets saved into <code>funko_items.extra</code>.
          </div>

          <label className="flex items-center gap-2 text-xs text-white/70">
            <input
              type="checkbox"
              name="extra_manual"
              checked={manual}
              onChange={(e) => setManual(e.target.checked)}
              className="h-4 w-4"
            />
            Edit manually
          </label>
        </div>

        {jsonError ? (
          <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
            {jsonError}
          </div>
        ) : null}

        <div className="mt-3">
          <div className="text-xs uppercase tracking-wide text-white/60">extra (JSON)</div>
          <textarea
            name="extra_json"
            value={extraText}
            onChange={(e) => setExtraText(e.target.value)}
            readOnly={!manual}
            rows={10}
            className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 font-mono text-xs text-white placeholder:text-white/40"
            placeholder={`{\n  "tags": ["FNAF"],\n  "notes": "..." \n}`}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15"
        >
          Save Funko Item
        </button>

        <Link href="/categories/funko/items" className="text-sky-300 hover:underline">
          Cancel
        </Link>
      </div>

      <div className="text-xs text-white/60">
        After saving, you can visit: <code className="break-all">/categories/funko/items/&lt;id&gt;</code>
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  placeholder,
  help,
}: {
  name: string;
  label: string;
  placeholder?: string;
  help?: string;
}) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-wide text-white/60">{label}</div>
      <input
        name={name}
        placeholder={placeholder}
        className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40"
      />
      {help ? <div className="mt-2 text-xs text-white/50">{help}</div> : null}
    </label>
  );
}

function TextArea({
  name,
  label,
  placeholder,
  rows = 6,
}: {
  name: string;
  label: string;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-wide text-white/60">{label}</div>
      <textarea
        name={name}
        placeholder={placeholder}
        rows={rows}
        className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40"
      />
    </label>
  );
}

function Toggle({ name, label }: { name: string; label: string }) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-white/15 bg-black/20 p-3">
      <input type="checkbox" name={name} className="h-4 w-4" />
      <div className="text-sm text-white">{label}</div>
    </label>
  );
}
