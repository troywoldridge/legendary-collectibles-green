"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";


type InitialCard = {
  game: string;
  cardId: string;
  cardName: string;
  setName: string;
  imageUrl: string;
};

type Props = {
  initial: InitialCard;
};

type GradeCompany = "UNGR" | "PSA" | "CGC";

const GRADE_OPTIONS: Record<GradeCompany, string[]> = {
  UNGR: ["Ungraded"],
  PSA: [
    "PSA 10",
    "PSA 9",
    "PSA 8",
    "PSA 7",
    "PSA 6",
    "PSA 5",
    "PSA 4",
    "PSA 3",
    "PSA 2",
    "PSA 1",
  ],
  CGC: ["CGC 10", "CGC 9.5", "CGC 9", "CGC 8.5", "CGC 8", "CGC 7.5", "CGC 7"],
};

export default function AddCollectionForm({ initial }: Props) {
  const router = useRouter();
  const [gradingCompany, setGradingCompany] =
    useState<GradeCompany>("UNGR");
  const [gradeLabel, setGradeLabel] = useState<string>(
    GRADE_OPTIONS.UNGR[0]
  );
  const [quantity, setQuantity] = useState<number>(1);
  const [folder, setFolder] = useState<string>("");
  const [cost, setCost] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!initial.cardId && !initial.cardName) {
      setError("Missing card information from the link.");
      return;
    }

    try {
      setSaving(true);

      const costCents = cost ? Math.round(Number(cost) * 100) : null;

      const res = await fetch("/api/collection/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          game: initial.game,
          cardId: initial.cardId,
          cardName: initial.cardName || undefined,
          setName: initial.setName || undefined,
          imageUrl: initial.imageUrl || undefined,
          grading_company: gradingCompany,
          grade_label: gradeLabel,
          quantity,
          folder: folder || null,
          cost_cents: costCents,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Failed to save collection item (HTTP ${res.status}) ${text}`
        );
      }

      router.push("/collection");
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Something went wrong saving this item. Please try again.");
      setSaving(false);
    }
  }

  const grades = GRADE_OPTIONS[gradingCompany];

  return (
  <form
    onSubmit={onSubmit}
    className="space-y-4 rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm"
  >
    <h2 className="text-lg font-semibold text-white">Collection details</h2>

    {/* Grading */}
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-white/60">
          Grading Company
        </label>
        <select
          value={gradingCompany}
          onChange={(e) => {
            const next = e.target.value as GradeCompany;
            setGradingCompany(next);
            setGradeLabel(GRADE_OPTIONS[next][0]);
          }}
          className="w-full rounded-md bg-white px-3 py-2 text-sm text-neutral-900"
        >
          <option className="text-neutral-900" value="UNGR">
            Ungraded
          </option>
          <option className="text-neutral-900" value="PSA">
            PSA
          </option>
          <option className="text-neutral-900" value="CGC">
            CGC
          </option>
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-white/60">
          Grade
        </label>
        <select
          value={gradeLabel}
          onChange={(e) => setGradeLabel(e.target.value)}
          className="w-full rounded-md bg-white px-3 py-2 text-sm text-neutral-900"
        >
          {grades.map((g) => (
            <option key={g} value={g} className="text-neutral-900">
              {g}
            </option>
          ))}
        </select>
      </div>
    </div>

    {/* Quantity + Folder */}
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-white/60">
          Quantity
        </label>
        <input
          type="number"
          min={1}
          value={quantity}
          onChange={(e) =>
            setQuantity(Math.max(1, Number(e.target.value) || 1))
          }
          className="w-full rounded-md bg-white/10 px-3 py-2 text-sm text-white"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-white/60">
          Folder / Binder
        </label>
        <input
          type="text"
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          placeholder="e.g. Binder 1, Deck Box"
          className="w-full rounded-md bg-white/10 px-3 py-2 text-sm text-white"
        />
      </div>
    </div>

    {/* Cost */}
    <div className="space-y-1">
      <label className="text-xs uppercase tracking-wide text-white/60">
        Purchase Cost (per copy, USD)
      </label>
      <input
        type="number"
        min={0}
        step="0.01"
        value={cost}
        onChange={(e) => setCost(e.target.value)}
        placeholder="e.g. 3.50"
        className="w-full rounded-md bg-white/10 px-3 py-2 text-sm text-white"
      />
      <p className="text-xs text-white/50">
        Optional. Used for profit / ROI calculations later.
      </p>
    </div>

    {error && (
      <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
        {error}
      </div>
    )}

    <div className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {saving ? "Saving…" : "Save to Collection"}
      </button>

      <Link
        href="/collection"
        className="text-sm text-white/70 hover:text-white hover:underline"
      >
        Cancel
      </Link>
    </div>
  </form>
);
}