/* eslint-disable @typescript-eslint/no-explicit-any */
// src/components/EditCollectionForm.tsx
"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

type CollectionItem = {
  id: string;
  game: string;
  card_id: string;
  card_name: string | null;
  set_name: string | null;
  image_url: string | null;
  grading_company: string;
  grade_label: string;
  cert_number: string | null;
  purchase_date: string | null; // normalized YYYY-MM-DD
  quantity: number;
  folder: string | null;
  cost_cents: number | null;
  last_value_cents: number | null;
};

const PSA_GRADES = ["PSA 10","PSA 9","PSA 8","PSA 7","PSA 6","PSA 5","PSA 4","PSA 3","PSA 2","PSA 1"];
const CGC_GRADES = ["CGC 10","CGC 9.5","CGC 9","CGC 8.5","CGC 8","CGC 7.5","CGC 7"];
const UNGRADED = ["Ungraded"];

type Props = {
  item: CollectionItem;
};

export default function EditCollectionForm({ item }: Props) {
  const router = useRouter();

  const [gradingCompany, setGradingCompany] = useState(item.grading_company || "UNGR");
  const [gradeLabel, setGradeLabel] = useState(item.grade_label || "Ungraded");
  const [certNumber, setCertNumber] = useState(item.cert_number ?? "");
  const [purchaseDate, setPurchaseDate] = useState(item.purchase_date ?? "");
  const [quantity, setQuantity] = useState<number>(item.quantity || 1);
  const [folder, setFolder] = useState(item.folder ?? "");
  const [cost, setCost] = useState<string>(
    item.cost_cents != null ? (item.cost_cents / 100).toFixed(2) : ""
  );
  const [lastValue, setLastValue] = useState<string>(
    item.last_value_cents != null ? (item.last_value_cents / 100).toFixed(2) : ""
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gradeOptions =
    gradingCompany === "PSA" ? PSA_GRADES :
    gradingCompany === "CGC" ? CGC_GRADES :
    UNGRADED;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        id: item.id,
        grading_company: gradingCompany,
        grade_label: gradeLabel,
        cert_number: certNumber || null,
        purchase_date: purchaseDate || null,
        quantity: quantity || 1,
        folder: folder || null,
        cost_cents: cost ? Math.round(Number(cost) * 100) : null,
        last_value_cents: lastValue ? Math.round(Number(lastValue) * 100) : null,
      };

      const res = await fetch("/api/collection/update", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Request failed (${res.status})`);
      }

      router.push("/collection");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Failed to save changes");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm"
    >
      <div className="flex gap-4">
        {item.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image_url}
            alt={item.card_name ?? ""}
            className="w-28 h-40 object-contain rounded bg-black/40"
          />
        )}
        <div>
          <div className="text-sm text-white/60">{item.set_name}</div>
          <div className="text-lg font-semibold">{item.card_name}</div>
          <div className="text-xs text-white/50 mt-1 uppercase tracking-wide">
            {item.game}
          </div>
        </div>
      </div>

      {/* Grade */}
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-white/70 mb-1">
            Grading Company
          </label>
          <select
            value={gradingCompany}
            onChange={(e) => {
              const val = e.target.value;
              setGradingCompany(val);
              // reset grade to first option in the new list
              const opts =
                val === "PSA" ? PSA_GRADES :
                val === "CGC" ? CGC_GRADES :
                UNGRADED;
              setGradeLabel(opts[0]);
            }}
            className="w-full bg-black/40 border border-white/20 rounded px-3 py-2 text-sm"
          >
            <option value="UNGR">Ungraded</option>
            <option value="PSA">PSA</option>
            <option value="CGC">CGC</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-white/70 mb-1">
            Grade
          </label>
          <select
            value={gradeLabel}
            onChange={(e) => setGradeLabel(e.target.value)}
            className="w-full bg-black/40 border border-white/20 rounded px-3 py-2 text-sm"
          >
            {gradeOptions.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Cert + Date */}
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-white/70 mb-1">
            Certification Number
          </label>
          <input
            type="text"
            value={certNumber}
            onChange={(e) => setCertNumber(e.target.value)}
            className="w-full bg-black/40 border border-white/20 rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-white/70 mb-1">
            Purchase Date
          </label>
          <input
            type="date"
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
            className="w-full bg-black/40 border border-white/20 rounded px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* Qty + Folder */}
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-white/70 mb-1">
            Quantity
          </label>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value) || 1)}
            className="w-full bg-black/40 border border-white/20 rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-white/70 mb-1">
            Folder / Binder
          </label>
          <input
            type="text"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            className="w-full bg-black/40 border border-white/20 rounded px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* Cost + Last Value */}
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-white/70 mb-1">
            Cost (per card, USD)
          </label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            className="w-full bg-black/40 border border-white/20 rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-white/70 mb-1">
            Last Estimated Value (per card, USD)
          </label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={lastValue}
            onChange={(e) => setLastValue(e.target.value)}
            className="w-full bg-black/40 border border-white/20 rounded px-3 py-2 text-sm"
          />
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/40 rounded px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-sm font-medium disabled:opacity-60"
        >
          {submitting ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 rounded border border-white/30 text-sm font-medium"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
