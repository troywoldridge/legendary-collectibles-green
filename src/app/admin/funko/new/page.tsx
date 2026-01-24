import "server-only";

import Link from "next/link";
import AdminTokenGate from "@/components/admin/AdminApiTokenGate";
import { upsertFunkoFromForm } from "./actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminFunkoNewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const errRaw = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  const error = errRaw ? String(errRaw) : null;

  return (
    <AdminTokenGate>
      <section className="space-y-6">
        <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-white">Add Funko Catalog Item</h1>
              <p className="mt-2 text-sm text-white/70">
                Creates/updates a row in <code>public.funko_items</code>. This is the{" "}
                <strong>collection catalog</strong> (not shop inventory).
              </p>
            </div>

            <div className="text-sm">
              <Link href="/categories/funko/items" className="text-sky-300 hover:underline">
                View catalog →
              </Link>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}
        </div>

        <form action={upsertFunkoFromForm} className="space-y-6">
          <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
            <h2 className="text-lg font-semibold text-white">Core identifiers</h2>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field
                name="id"
                label="Canonical ID (optional)"
                placeholder="funko:72471"
                help="If blank, we’ll auto-generate funko:<upc>."
              />
              <Field name="upc" label="UPC" placeholder="889698724715" />

              <Field name="source" label="Source" placeholder="supplier" />
              <Field name="source_id" label="Source ID" placeholder="FUKO72471" />
            </div>
          </div>

          <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
            <h2 className="text-lg font-semibold text-white">Catalog fields</h2>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field name="name" label="Name" placeholder="Chica (FNAF)" />
              <Field name="franchise" label="Franchise" placeholder="Five Nights at Freddy's" />
              <Field name="series" label="Series" placeholder="RUIN" />
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

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field name="image_small" label="Image (small)" placeholder="https://..." />
              <Field name="image_large" label="Image (large)" placeholder="https://..." />
            </div>

            <div className="mt-4">
              <TextArea
                name="description"
                label="Description"
                placeholder="Paste the official Funko description here…"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
            <h2 className="text-lg font-semibold text-white">Extra JSON (optional)</h2>
            <p className="mt-1 text-sm text-white/70">
              Stored into <code>funko_items.extra</code> (jsonb). Keep it small + structured.
            </p>

            <div className="mt-4">
              <TextArea
                name="extra_json"
                label="extra (JSON)"
                placeholder={`{\n  "brand": "FUNKO",\n  "weight_lb": 0.2\n}`}
                rows={10}
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
            After saving, you can visit:{" "}
            <code className="break-all">/categories/funko/items/&lt;id&gt;</code>
          </div>
        </form>
      </section>
    </AdminTokenGate>
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
